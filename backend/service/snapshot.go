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

// StartSnapshotScheduler 启动每日快照调度器，并异步执行启动补跑：
// 若当前北京时间已过今天 06:00 且存在任一自动跟踪资产（yahoo/computed_gold_cny）
// 今日无快照行，则补跑 RunSnapshot 一次（goroutine 内执行，不阻塞启动，recover 兜底）。
// 返回已 Start 的 cron 句柄，调用方负责 Stop（通常 main 里 defer）。
// cron v3.0.1 的 New() 默认链为空、startJob 裸跑 j.Run()（无 recover），
// 故显式 WithChain(Recover) 保护定时任务；补跑 goroutine 自带 recover。
func StartSnapshotScheduler(ctx context.Context, db *sqlx.DB, qs *quote.Service) *cron.Cron {
	c := cron.New(cron.WithLocation(snapshotLoc), cron.WithChain(cron.Recover(cron.DefaultLogger)))
	if _, err := c.AddFunc(snapshotCronSpec, func() {
		RunSnapshot(ctx, db, qs)
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
		if catchUpNeeded(ctx, db) {
			log.Printf("snapshot: running startup catch-up")
			RunSnapshot(ctx, db, qs)
		}
	}()

	return c
}

// catchUpNeeded 判断是否需要启动补跑：
//  1. 当前北京时间已过今天 06:00；
//  2. 存在任一自动跟踪资产今日无 price_history 行（date=CURDATE()，与 upsert 同口径）。
//
// 查询失败只 log 并返回 false（补跑是 best-effort，不影响启动）。
func catchUpNeeded(ctx context.Context, db *sqlx.DB) bool {
	now := time.Now().In(snapshotLoc)
	today6am := time.Date(now.Year(), now.Month(), now.Day(), 6, 0, 0, 0, snapshotLoc)
	if now.Before(today6am) {
		return false
	}
	var missing int
	err := db.GetContext(ctx, &missing,
		`SELECT COUNT(*) FROM assets a
		 WHERE a.price_source IN ('yahoo','computed_gold_cny')
		   AND NOT EXISTS (SELECT 1 FROM price_history p
		                   WHERE p.symbol=a.symbol AND p.date=CURDATE())`)
	if err != nil {
		log.Printf("snapshot: catch-up check failed: %v", err)
		return false
	}
	return missing > 0
}

// RunSnapshot 为全部自动跟踪资产（price_source IN yahoo/computed_gold_cny，manual 不快照）
// 抓取当前价并写入今日 price_history：
//   - 仅取 !Stale 且 Price>0 的报价（qs.Quotes 永不返回 error，缺席即跳过）；
//   - upsert 依赖 uk_symbol_date 幂等，当日重跑覆盖 close；
//   - 空资产表 → log "0/0" 正常返回；单条失败只 log 继续。
func RunSnapshot(ctx context.Context, db *sqlx.DB, qs *quote.Service) {
	var assets []struct {
		Symbol      string `db:"symbol"`
		PriceSource string `db:"price_source"`
	}
	if err := db.SelectContext(ctx, &assets,
		`SELECT symbol, price_source FROM assets WHERE price_source IN ('yahoo','computed_gold_cny')`); err != nil {
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
			`INSERT INTO price_history (symbol, date, close) VALUES (?,CURDATE(),?)
			 ON DUPLICATE KEY UPDATE close=VALUES(close)`,
			sym, q.Price)
		if err != nil {
			log.Printf("snapshot: upsert %s: %v", sym, err)
			continue
		}
		saved++
	}
	log.Printf("snapshot: %d/%d assets", saved, len(assets))
}
