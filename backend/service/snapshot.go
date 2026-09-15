// Package service 提供应用层后台服务：每日价格快照调度与启动补跑。
package service

import (
	"context"
	"log"
	"time"

	"blog/pkg/quote"

	"github.com/jmoiron/sqlx"
	"github.com/robfig/cron/v3"
)

// snapshotLoc 为北京时间固定时区（UTC+8），用 FixedZone 避免依赖系统 tzdata。
var snapshotLoc = time.FixedZone("CST", 8*3600)

// snapshotCronSpec 为每日 06:00（北京时间，由 cron.WithLocation 解释）触发。
const snapshotCronSpec = "0 6 * * *"

// AutoTrackedWhere 为自动跟踪资产的 SQL 谓词（manual 手输价不参与自动行情）。
// 单一来源：本文件两处快照查询与 handler/invest.go 的强制刷新端点共用，勿复制粘贴
// （谓词列 price_source 不带别名，在带别名的查询中同样可解析——仅 assets 有该列）。
const AutoTrackedWhere = "price_source IN ('yahoo','computed_gold_cny','fund_cn')"

// StartSnapshotScheduler 启动每日快照调度器，并异步执行启动补跑：
// 若当前北京时间已过今天 06:00 且存在任一自动跟踪资产（yahoo/computed_gold_cny/fund_cn）
// 在补跑日期（今天 06:00 CST 对应的 UTC 日期，恒为 D-1，与 cron 行日期同口径）
// 无快照行，则补跑 RunSnapshot 一次（goroutine 内执行，不阻塞启动，recover 兜底）。
// 返回已 Start 的 cron 句柄，调用方负责 Stop（通常 main 里 defer）。
// cron v3.0.1 的 New() 默认链为空、startJob 裸跑 j.Run()（无 recover），
// 故显式 WithChain(Recover) 保护定时任务；补跑 goroutine 自带 recover。
func StartSnapshotScheduler(ctx context.Context, db *sqlx.DB, qs *quote.Service) *cron.Cron {
	c := cron.New(cron.WithLocation(snapshotLoc), cron.WithChain(cron.Recover(cron.DefaultLogger)))
	if _, err := c.AddFunc(snapshotCronSpec, func() {
		// 06:00 CST = 前一日 22:00 UTC，UTC 日期即刚收盘的美股交易日
		RunSnapshot(ctx, db, qs, time.Now().UTC())
	}); err != nil {
		log.Printf("snapshot: invalid cron spec %q: %v", snapshotCronSpec, err)
	}
	c.Start()
	log.Printf("snapshot: scheduler started (daily %s Beijing time)", snapshotCronSpec)

	// 启动补跑：裸 goroutine 不经 cron 的 Recover 链，自旋 recover 兜底
	//（参考 handler/asset.go 回填 goroutine 的模式）。
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("snapshot: startup catch-up panic: %v", r)
			}
		}()
		if snapshotDate, needed := catchUpNeeded(ctx, db); needed {
			log.Printf("snapshot: running startup catch-up (date=%s)", snapshotDate.Format("2006-01-02"))
			RunSnapshot(ctx, db, qs, snapshotDate)
		}
	}()

	return c
}

// catchUpNeeded 判断是否需要启动补跑，并返回补跑应写入的日期：
//  1. 当前北京时间已过今天 06:00；
//  2. 存在任一自动跟踪资产在该日期无 price_history 行。
//
// 日期口径：cron 在 06:00 CST（=前一日 22:00 UTC）按 UTC 日期写行（≈美股交易日），
// 故补跑检查/写入统一用「今天 06:00 CST 换算成 UTC 的日期」（恒为 D-1），与 cron 行日期一致。
// 不能用 CURDATE()：08:00 CST（=UTC 00:00）后 UTC 翻到 D，当天 06:00 写的却是 D-1，
// 会导致每次重启伪补跑（重复写 date=D 行 + 多打一轮上游行情）。
//
// 查询失败只 log 并返回 false（补跑是 best-effort，不影响启动）。
func catchUpNeeded(ctx context.Context, db *sqlx.DB) (time.Time, bool) {
	now := time.Now().In(snapshotLoc)
	today6am := time.Date(now.Year(), now.Month(), now.Day(), 6, 0, 0, 0, snapshotLoc)
	if now.Before(today6am) {
		return time.Time{}, false
	}
	snapshotDate := today6am.In(time.UTC) // 恒为前一日 22:00 UTC
	var missing int
	err := db.GetContext(ctx, &missing,
		`SELECT COUNT(*) FROM assets a
		 WHERE `+AutoTrackedWhere+`
		   AND NOT EXISTS (SELECT 1 FROM price_history p
		                   WHERE p.symbol=a.symbol AND p.date=?)`,
		snapshotDate.Format("2006-01-02"))
	if err != nil {
		log.Printf("snapshot: catch-up check failed: %v", err)
		return time.Time{}, false
	}
	return snapshotDate, missing > 0
}

// RunSnapshot 为全部自动跟踪资产（price_source IN yahoo/computed_gold_cny/fund_cn，manual 不快照）
// 抓取当前价并写入 price_history 的指定日期行：
//   - 日期口径：行日期 = snapshotDate 的 UTC 日期 ≈ 美股交易日；
//     cron 06:00 CST 触发时 = 前一日 22:00 UTC，故传 time.Now().UTC() 即为刚收盘的交易日；
//     对 fund_cn 该口径同样成立——06:00 CST 时 D-1 的官方净值已公布、D 日净值尚未产生，
//     取到的正是 D-1 净值，写入 date=D-1 行；
//   - 仅取 !Stale 且 Price>0 的报价（qs.Quotes 永不返回 error，缺席即跳过）；
//   - upsert 依赖 uk_symbol_date 幂等，同日期重跑覆盖 close；
//   - 空资产表 → log "0/0" 正常返回；单条失败只 log 继续。
func RunSnapshot(ctx context.Context, db *sqlx.DB, qs *quote.Service, snapshotDate time.Time) {
	dateStr := snapshotDate.Format("2006-01-02")
	var assets []struct {
		Symbol      string `db:"symbol"`
		PriceSource string `db:"price_source"`
	}
	if err := db.SelectContext(ctx, &assets,
		`SELECT symbol, price_source FROM assets WHERE `+AutoTrackedWhere); err != nil {
		log.Printf("snapshot: load assets: %v", err)
		return
	}
	if len(assets) == 0 {
		log.Printf("snapshot: 0/0 assets")
		return
	}

	symbols := make([]string, 0, len(assets))
	for _, a := range assets {
		symbols = append(symbols, a.Symbol)
	}
	quotes := qs.Quotes(ctx, symbols)

	saved := 0
	for _, sym := range symbols {
		q, ok := quotes[sym]
		if !ok || q.Stale || q.Price <= 0 {
			continue
		}
		_, err := db.ExecContext(ctx,
			`INSERT INTO price_history (symbol, date, close) VALUES (?,?,?)
			 ON DUPLICATE KEY UPDATE close=VALUES(close)`,
			sym, dateStr, q.Price)
		if err != nil {
			log.Printf("snapshot: upsert %s: %v", sym, err)
			continue
		}
		saved++
	}
	log.Printf("snapshot: %d/%d assets (date=%s)", saved, len(assets), dateStr)
}
