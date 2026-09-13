package quote

import (
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// ---- fixtures：真实形态（2026-09 实测天天基金响应，字段名/嵌套/占位符照抄） ----

// fundMNFInfoEstimateBody 为盘中估值可用时的 FundMNFInfo 响应（GSZ/GSZZL/GZTIME 非空）。
const fundMNFInfoEstimateBody = `{"Datas":[{"FCODE":"110022","SHORTNAME":"易方达消费行业股票","PDATE":"2026-09-11","NAV":"2.8260","ACCNAV":"2.8260","NAVCHGRT":"-0.60","GSZ":"2.8510","GSZZL":"0.88","GZTIME":"2026-09-11 15:00","NEWPRICE":null,"CHANGERATIO":null,"ZJL":null,"HQDATE":null,"ISHAVEREDPACKET":false}],"ErrCode":0,"Success":true,"ErrMsg":null,"Message":null,"ErrorCode":"0","ErrorMessage":null,"ErrorMsgLst":null,"TotalCount":1,"Expansion":{"GZTIME":"2026-09-11","FSRQ":"2026-09-11"}}`

// fundMNFInfoNAVBody 为收盘后/非交易日的真实响应形态（GSZ/GSZZL/GZTIME 均为 null）。
const fundMNFInfoNAVBody = `{"Datas":[{"FCODE":"110022","SHORTNAME":"易方达消费行业股票","PDATE":"2026-09-11","NAV":"2.8260","ACCNAV":"2.8260","NAVCHGRT":"-0.60","GSZ":null,"GSZZL":null,"GZTIME":null,"NEWPRICE":null,"CHANGERATIO":null,"ZJL":null,"HQDATE":null,"ISHAVEREDPACKET":false}],"ErrCode":0,"Success":true,"ErrMsg":null,"Message":null,"ErrorCode":"0","ErrorMessage":null,"ErrorMsgLst":null,"TotalCount":1,"Expansion":{"GZTIME":"2026-09-11","FSRQ":"2026-09-11"}}`

// fundMNFInfoBody 用给定 JSON 字面量替换 NAV/GSZ，以覆盖 string/number/null/"--" 各形态。
func fundMNFInfoBody(nav, gsz string) string {
	return `{"Datas":[{"FCODE":"110022","SHORTNAME":"易方达消费行业股票","PDATE":"2026-09-11","NAV":` + nav +
		`,"ACCNAV":"2.8260","NAVCHGRT":"-0.60","GSZ":` + gsz +
		`,"GSZZL":null,"GZTIME":null,"NEWPRICE":null,"CHANGERATIO":null,"ZJL":null,"HQDATE":null,` +
		`"ISHAVEREDPACKET":false}],"ErrCode":0,"Success":true,"ErrMsg":null,"TotalCount":1}`
}

// lsjzRowFmt 为一行真实形态历史净值记录（f10/lsjz）。
const lsjzRowFmt = `{"FSRQ":"%s","DWJZ":"%s","LJJZ":"%s","SDATE":null,"ACTUALSYI":"","NAVTYPE":"1",` +
	`"JZZZL":"-0.60","SGZT":"开放申购","SHZT":"开放赎回","FHFCZ":"","FHFCZ10":"","FHFCBZ":"",` +
	`"DTYPE":null,"FHSP":""}`

// lsjzBody 把若干行包进真实形态的 lsjz 响应外壳。
func lsjzBody(rows ...string) string {
	return `{"Data":{"LSJZList":[` + strings.Join(rows, ",") +
		`]},"ErrCode":0,"ErrMsg":null,"TotalCount":3885,"Expansion":null,"PageSize":0,"PageIndex":0}`
}

// lsjzRows 生成 n 行净值，日期自 base 起逐日往前（即接口的「新→旧」顺序）。
func lsjzRows(base time.Time, n int) []string {
	rows := make([]string, 0, n)
	for i := 0; i < n; i++ {
		nav := strconv.FormatFloat(3.0-float64(i)*0.001, 'f', 4, 64)
		rows = append(rows, fmt.Sprintf(lsjzRowFmt, base.AddDate(0, 0, -i).Format("2006-01-02"), nav, nav))
	}
	return rows
}

// lsjzProbe 记录 lsjz 请求的头与查询参数，供断言 Referer/分页契约。
type lsjzProbe struct {
	mu         sync.Mutex
	referers   []string
	userAgents []string
	pageIndex  []string
	pageSize   []string
	fundCodes  []string
}

func (p *lsjzProbe) record(r *http.Request) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.referers = append(p.referers, r.Header.Get("Referer"))
	p.userAgents = append(p.userAgents, r.Header.Get("User-Agent"))
	p.pageIndex = append(p.pageIndex, r.URL.Query().Get("pageIndex"))
	p.pageSize = append(p.pageSize, r.URL.Query().Get("pageSize"))
	p.fundCodes = append(p.fundCodes, r.URL.Query().Get("fundCode"))
}

func (p *lsjzProbe) requests() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.pageIndex)
}

// newLSJZServer 按 pageIndex 返回 pages 中对应页（缺页 → 空 LSJZList）。
func newLSJZServer(t *testing.T, pages map[int]string) (*httptest.Server, *lsjzProbe) {
	t.Helper()
	probe := &lsjzProbe{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		probe.record(r)
		page, _ := strconv.Atoi(r.URL.Query().Get("pageIndex"))
		body, ok := pages[page]
		if !ok {
			body = lsjzBody() // 空列表：模拟翻到数据尽头
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv, probe
}

// newTestFundCN 构造两个 baseURL 均指向 httptest 的 FundCNProvider。
// lsjzPages 为 nil 时历史端点返回空列表。
func newTestFundCN(t *testing.T, mnfBody string, lsjzPages map[int]string) (*FundCNProvider, *lsjzProbe) {
	t.Helper()
	mnfSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(mnfBody))
	}))
	t.Cleanup(mnfSrv.Close)
	lsjzSrv, probe := newLSJZServer(t, lsjzPages)

	p := NewFundCNProvider(mnfSrv.Client())
	p.fundMNFInfoBaseURL = mnfSrv.URL + "/FundMNewApi/FundMNFInfo"
	p.lsjzBaseURL = lsjzSrv.URL + "/f10/lsjz"
	return p, probe
}

// 场景①：GSZ>0 → price 用盘中估值、PreviousClose 用官方净值、货币恒 CNY；Fcodes 传基金代码。
func TestFundCNFetchUsesIntradayEstimate(t *testing.T) {
	var gotFcodes, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotFcodes = r.URL.Query().Get("Fcodes")
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(fundMNFInfoEstimateBody))
	}))
	t.Cleanup(srv.Close)

	p := NewFundCNProvider(srv.Client())
	p.fundMNFInfoBaseURL = srv.URL + "/FundMNewApi/FundMNFInfo"

	q, err := p.Fetch(contextOf(), "110022")
	if err != nil {
		t.Fatal(err)
	}
	if q.Price != 2.851 {
		t.Fatalf("Price=%v want GSZ 2.851", q.Price)
	}
	if q.PreviousClose != 2.826 {
		t.Fatalf("PreviousClose=%v want NAV 2.826", q.PreviousClose)
	}
	if q.Currency != "CNY" {
		t.Fatalf("Currency=%q want CNY", q.Currency)
	}
	if gotFcodes != "110022" {
		t.Fatalf("Fcodes=%q want 110022", gotFcodes)
	}
	if gotPath != "/FundMNewApi/FundMNFInfo" {
		t.Fatalf("path=%q", gotPath)
	}
	if p.Name() != "fund_cn" {
		t.Fatalf("Name=%q want fund_cn", p.Name())
	}
}

// 场景②：GSZ 为 null / 空串 / "0" / 数字 0 → 退回官方净值，PreviousClose=0。
func TestFundCNFetchFallsBackToNAV(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{"gsz null（实测非交易日形态）", fundMNFInfoNAVBody},
		{"gsz 空串", fundMNFInfoBody(`"2.8260"`, `""`)},
		{"gsz 字符串 0", fundMNFInfoBody(`"2.8260"`, `"0"`)},
		{"gsz 数字 0", fundMNFInfoBody(`2.8260`, `0`)},
		{"gsz 占位符 --", fundMNFInfoBody(`"2.8260"`, `"--"`)},
		{"nav 为数字形态", fundMNFInfoBody(`2.8260`, `null`)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, _ := newTestFundCN(t, c.body, nil)
			q, err := p.Fetch(contextOf(), "110022")
			if err != nil {
				t.Fatal(err)
			}
			if q.Price != 2.826 {
				t.Fatalf("Price=%v want NAV 2.826", q.Price)
			}
			if q.PreviousClose != 0 {
				t.Fatalf("PreviousClose=%v want 0（无估值时无昨收语义）", q.PreviousClose)
			}
			if q.Currency != "CNY" {
				t.Fatalf("Currency=%q", q.Currency)
			}
		})
	}
}

// 场景③：NAV 缺失/占位符/非正、Datas 空、Success=false → error（降级链跳到兜底）。
func TestFundCNFetchInvalidNAVIsError(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{"NAV 占位符 --", fundMNFInfoBody(`"--"`, `null`)},
		{"NAV 空串", fundMNFInfoBody(`""`, `null`)},
		{"NAV null", fundMNFInfoBody(`null`, `null`)},
		{"NAV 字符串 0", fundMNFInfoBody(`"0"`, `null`)},
		{"NAV 字段缺失", `{"Datas":[{"FCODE":"110022","SHORTNAME":"x","PDATE":"2026-09-11"}],"ErrCode":0,"Success":true,"TotalCount":1}`},
		{"Datas 为空数组", `{"Datas":[],"ErrCode":0,"Success":true,"ErrMsg":null,"TotalCount":0}`},
		{"Datas 为 null", `{"Datas":null,"ErrCode":0,"Success":true,"ErrMsg":null,"TotalCount":0}`},
		{"Success=false", `{"Datas":[{"FCODE":"110022","NAV":"2.8260","GSZ":null}],"ErrCode":404,"Success":false,"ErrMsg":"网络繁忙，请稍后重试！","TotalCount":0}`},
		{"非 JSON 响应（如 CDN 404 页）", `<!doctype html><html><head><title>页面未找到 - 东方财富网</title></head></html>`},
		{"空 body", ``},
		{"空 JSON 对象", `{}`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, _ := newTestFundCN(t, c.body, nil)
			if _, err := p.Fetch(contextOf(), "110022"); err == nil {
				t.Fatalf("want error for %s", c.name)
			}
		})
	}
}

// 修复轮 1 / Important #1：strconv.ParseFloat 对字面量 "NaN"/"Inf"/"-Inf"/"Infinity"
// 返回非有限值且 err==nil，「脏数据按缺失处理」的契约对这类输入会静默失效——
// NaN 能绕过 nav<=0 判定（NaN 比较恒 false）一路传到 gin 的 JSON 渲染
// （json.Marshal(NaN) 报错 → Render panic → Recovery 500），击穿「positions 恒 200」。
func TestFundCNFetchRejectsNonFiniteNumbers(t *testing.T) {
	cases := []struct{ name, nav, gsz string }{
		{`NAV="NaN"`, `"NaN"`, `null`},
		{`NAV="Inf"`, `"Inf"`, `null`},
		{`NAV="-Inf"`, `"-Inf"`, `null`},
		{`NAV="Infinity"`, `"Infinity"`, `null`},
		{`NAV="nan"（ParseFloat 大小写不敏感）`, `"nan"`, `null`},
		{`NAV=+Inf（JSON 数字溢出，走 ErrRange 分支）`, `1e999`, `null`},
		{`NAV="-Infinity"`, `"-Infinity"`, `null`},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p, _ := newTestFundCN(t, fundMNFInfoBody(c.nav, c.gsz), nil)
			q, err := p.Fetch(contextOf(), "110022")
			if err == nil {
				t.Fatalf("want error, got q=%+v", q)
			}
			if q != nil && (math.IsNaN(q.Price) || math.IsInf(q.Price, 0)) {
				t.Fatalf("非有限值不得出现在 RawQuote 里: %+v", q)
			}
		})
	}

	// GSZ 非有限时不得污染 price：必须退回官方净值且为有限值。
	t.Run(`GSZ="NaN" 退回 NAV`, func(t *testing.T) {
		p, _ := newTestFundCN(t, fundMNFInfoBody(`"2.8260"`, `"NaN"`), nil)
		q, err := p.Fetch(contextOf(), "110022")
		if err != nil {
			t.Fatal(err)
		}
		if q.Price != 2.826 || q.PreviousClose != 0 {
			t.Fatalf("q=%+v want price=2.826 prev=0", q)
		}
		if math.IsNaN(q.Price) || math.IsInf(q.Price, 0) {
			t.Fatalf("price 非有限值: %v", q.Price)
		}
	})
}

// 修复轮 1 / Important #1（History 侧）：DWJZ 为 NaN/Inf 的行必须跳过，
// 否则非有限 close 会写进 price_history 并顺着价值曲线/持仓扩散。
func TestFundCNHistorySkipsNonFiniteDWJZ(t *testing.T) {
	body := lsjzBody(
		fmt.Sprintf(lsjzRowFmt, "2026-09-11", "2.8260", "2.8260"),
		fmt.Sprintf(lsjzRowFmt, "2026-09-10", "NaN", "NaN"),
		fmt.Sprintf(lsjzRowFmt, "2026-09-09", "Inf", "Inf"),
		fmt.Sprintf(lsjzRowFmt, "2026-09-08", "2.9080", "2.9080"),
	)
	p, _ := newTestFundCN(t, fundMNFInfoNAVBody, map[int]string{1: body})

	points, err := p.History(contextOf(), "110022", 30)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != 2 {
		t.Fatalf("len=%d want 2（NaN/Inf 两行必须跳过）points=%+v", len(points), points)
	}
	for _, pt := range points {
		if math.IsNaN(pt.Close) || math.IsInf(pt.Close, 0) {
			t.Fatalf("Close 非有限值: %+v", pt)
		}
	}

	// 全为非有限值 → 无有效点 → error（不返回空切片）。
	p2, _ := newTestFundCN(t, fundMNFInfoNAVBody,
		map[int]string{1: lsjzBody(fmt.Sprintf(lsjzRowFmt, "2026-09-11", "NaN", "NaN"))})
	if _, err := p2.History(contextOf(), "110022", 30); err == nil {
		t.Fatal("want error when 全部行非有限")
	}
}

// 修复轮 1 / Important #2：必须校验上游回显的 FCODE 与请求 symbol 一致。
// 盲信 Datas[0] 时，上游/CDN 串数据会把别的标的净值静默写进 current_price/快照/回填历史
// ——金融记账系统里最坏的一类故障（不可检测的数据损坏）；宁可无价走 last-known 兜底。
func TestFundCNFetchVerifiesFCODE(t *testing.T) {
	t.Run("FCODE 指向别的基金 → error", func(t *testing.T) {
		body := `{"Datas":[{"FCODE":"110023","SHORTNAME":"别的基金","PDATE":"2026-09-11","NAV":"1.2340","GSZ":null}],` +
			`"ErrCode":0,"Success":true,"TotalCount":1}`
		p, _ := newTestFundCN(t, body, nil)
		if _, err := p.Fetch(contextOf(), "110022"); err == nil {
			t.Fatal("want error on FCODE mismatch")
		}
	})
	t.Run("FCODE 缺失 → error（实测响应恒含该字段，缺失即异常）", func(t *testing.T) {
		body := `{"Datas":[{"SHORTNAME":"易方达消费行业股票","PDATE":"2026-09-11","NAV":"2.8260","GSZ":null}],` +
			`"ErrCode":0,"Success":true,"TotalCount":1}`
		p, _ := newTestFundCN(t, body, nil)
		if _, err := p.Fetch(contextOf(), "110022"); err == nil {
			t.Fatal("want error when FCODE 缺失")
		}
	})
	t.Run("FCODE 匹配 → 正常放行（不误伤）", func(t *testing.T) {
		p, _ := newTestFundCN(t, fundMNFInfoEstimateBody, nil)
		q, err := p.Fetch(contextOf(), "110022")
		if err != nil {
			t.Fatal(err)
		}
		if q.Price != 2.851 || q.PreviousClose != 2.826 {
			t.Fatalf("q=%+v", q)
		}
	})
}

// 场景④：symbol 契约——非纯 6 位数字一律 ErrUnsupported，且不发任何 HTTP 请求。
func TestFundCNUnsupportedSymbol(t *testing.T) {
	p, probe := newTestFundCN(t, fundMNFInfoNAVBody, map[int]string{1: lsjzBody(lsjzRows(time.Now(), 3)...)})
	for _, sym := range []string{"12345", "1100221", "AAPL", "600519.SS", "0700.HK", "", "11002A", "GOLD_CNY_G", " 110022", "110022 "} {
		if _, err := p.Fetch(contextOf(), sym); err != ErrUnsupported {
			t.Fatalf("Fetch(%q): want ErrUnsupported, got %v", sym, err)
		}
		if _, err := p.History(contextOf(), sym, 30); err != ErrUnsupported {
			t.Fatalf("History(%q): want ErrUnsupported, got %v", sym, err)
		}
	}
	if n := probe.requests(); n != 0 {
		t.Fatalf("guard 应在发请求前拦截，实际发出 %d 次 lsjz 请求", n)
	}
}

// 场景⑤：lsjz 分页（新→旧）转升序、"--" 跳过、短页终止；Referer/UA/查询参数断言。
func TestFundCNHistoryPaginatesToAscending(t *testing.T) {
	base := time.Date(2026, 9, 11, 0, 0, 0, 0, time.Local)
	// 第 2 页手写：3 行（短页 → 终止），中间一行为停牌占位符 "--" 必须跳过。
	page2 := lsjzBody(
		fmt.Sprintf(lsjzRowFmt, "2026-08-22", "2.7000", "2.7000"),
		fmt.Sprintf(lsjzRowFmt, "2026-08-21", "--", "--"),
		fmt.Sprintf(lsjzRowFmt, "2026-08-20", "2.6800", "2.6800"),
	)
	p, probe := newTestFundCN(t, fundMNFInfoNAVBody, map[int]string{
		1: lsjzBody(lsjzRows(base, lsjzPageSize)...), // 满页 → 继续翻
		2: page2,
	})

	points, err := p.History(contextOf(), "110022", 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(points) != lsjzPageSize+2 {
		t.Fatalf("len=%d want %d（20 满页 + 短页 3 行去掉 1 行 \"--\"）", len(points), lsjzPageSize+2)
	}
	// 升序：首点为最旧（2026-08-20），末点为最新（2026-09-11）。
	if got := points[0]; got.Close != 2.68 || !got.Date.Equal(time.Date(2026, 8, 20, 0, 0, 0, 0, time.Local)) {
		t.Fatalf("points[0]=%+v want 2026-08-20@2.68", got)
	}
	last := points[len(points)-1]
	if last.Close != 3.0 || !last.Date.Equal(base) {
		t.Fatalf("points[last]=%+v want %s@3.0", last, base.Format("2006-01-02"))
	}
	for i := 1; i < len(points); i++ {
		if !points[i].Date.After(points[i-1].Date) {
			t.Fatalf("points 非严格升序 @%d: %v then %v", i, points[i-1].Date, points[i].Date)
		}
	}
	// 日期必须是本地午夜（price_history.date 为 DATE，DSN loc=Local）。
	for _, pt := range points {
		if pt.Date.Hour() != 0 || pt.Date.Minute() != 0 || pt.Date.Second() != 0 {
			t.Fatalf("Date=%v 非本地午夜", pt.Date)
		}
	}

	probe.mu.Lock()
	defer probe.mu.Unlock()
	if len(probe.pageIndex) != 2 || probe.pageIndex[0] != "1" || probe.pageIndex[1] != "2" {
		t.Fatalf("pageIndex 序列=%v want [1 2]（短页后必须停止翻页）", probe.pageIndex)
	}
	for i := range probe.pageIndex {
		if probe.referers[i] != fundCNReferer {
			t.Fatalf("Referer=%q want %q（缺失会被上游 403）", probe.referers[i], fundCNReferer)
		}
		if probe.userAgents[i] != fundCNUserAgent {
			t.Fatalf("User-Agent=%q want %q", probe.userAgents[i], fundCNUserAgent)
		}
		if probe.pageSize[i] != strconv.Itoa(lsjzPageSize) {
			t.Fatalf("pageSize=%q want %q（上游硬上限 20，超出会返回 Data:null）", probe.pageSize[i], lsjzPageSize)
		}
		if probe.fundCodes[i] != "110022" {
			t.Fatalf("fundCode=%q want 110022", probe.fundCodes[i])
		}
	}
}

// 场景⑤b：累计点数达到 days 即停止翻页（不多打上游）；返回超集由 Service 截取。
func TestFundCNHistoryStopsWhenDaysReached(t *testing.T) {
	base := time.Date(2026, 9, 11, 0, 0, 0, 0, time.Local)
	pages := map[int]string{}
	for i := 1; i <= 5; i++ {
		pages[i] = lsjzBody(lsjzRows(base.AddDate(0, 0, -(i-1)*lsjzPageSize), lsjzPageSize)...)
	}
	p, probe := newTestFundCN(t, fundMNFInfoNAVBody, pages)

	points, err := p.History(contextOf(), "110022", 25)
	if err != nil {
		t.Fatal(err)
	}
	if n := probe.requests(); n != 2 {
		t.Fatalf("requests=%d want 2（第 1 页 20 点 < 25，第 2 页累计 40 ≥ 25 即停）", n)
	}
	if len(points) != 2*lsjzPageSize {
		t.Fatalf("len=%d want %d", len(points), 2*lsjzPageSize)
	}
}

// 场景⑤c：页数上限保护——上游恒返回满页时不得无限翻页。
func TestFundCNHistoryRespectsPageCap(t *testing.T) {
	base := time.Date(2026, 9, 11, 0, 0, 0, 0, time.Local)
	pages := map[int]string{}
	for i := 1; i <= lsjzMaxPages+5; i++ {
		pages[i] = lsjzBody(lsjzRows(base.AddDate(0, 0, -(i-1)*lsjzPageSize), lsjzPageSize)...)
	}
	p, probe := newTestFundCN(t, fundMNFInfoNAVBody, pages)

	if _, err := p.History(contextOf(), "110022", 100000); err != nil {
		t.Fatal(err)
	}
	if n := probe.requests(); n != lsjzMaxPages {
		t.Fatalf("requests=%d want 页数上限 %d", n, lsjzMaxPages)
	}
}

// 场景⑤d：无有效点（Data:null / 空列表 / 全 "--" / 日期畸形）→ error，不返回空切片。
func TestFundCNHistoryNoValidPointsIsError(t *testing.T) {
	cases := map[string]string{
		"Data 为 null（上游拒绝该 pageSize 时的真实形态）": `{"Data":null,"ErrCode":0,"ErrMsg":null,"TotalCount":0,"Expansion":null,"PageSize":0,"PageIndex":0}`,
		"LSJZList 为空":      lsjzBody(),
		"全部 DWJZ 为 --":     lsjzBody(fmt.Sprintf(lsjzRowFmt, "2026-09-11", "--", "--")),
		"FSRQ 畸形":          lsjzBody(fmt.Sprintf(lsjzRowFmt, "11/09/2026", "2.8260", "2.8260")),
		"DWJZ 为非数值脏字符串":    lsjzBody(fmt.Sprintf(lsjzRowFmt, "2026-09-11", "暂无", "暂无")),
		"空 body":           ``,
		"Data.LSJZList 缺失": `{"Data":{},"ErrCode":0,"ErrMsg":null,"TotalCount":0}`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			p, _ := newTestFundCN(t, fundMNFInfoNAVBody, map[int]string{1: body})
			if _, err := p.History(contextOf(), "110022", 30); err == nil {
				t.Fatalf("want error for %s", name)
			}
		})
	}
}

// 场景⑥：HTTP 500 → Fetch/History 均 error（不 panic、不返回半成品）。
func TestFundCNHTTPErrorIsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)

	p := NewFundCNProvider(srv.Client())
	p.fundMNFInfoBaseURL = srv.URL + "/FundMNewApi/FundMNFInfo"
	p.lsjzBaseURL = srv.URL + "/f10/lsjz"

	if _, err := p.Fetch(contextOf(), "110022"); err == nil {
		t.Fatal("want error on http 500 (fetch)")
	}
	if _, err := p.History(contextOf(), "110022", 30); err == nil {
		t.Fatal("want error on http 500 (history)")
	}
}

// 中间页失败：已有点位时返回部分结果（best-effort），首页失败才 error。
func TestFundCNHistoryPartialOnLaterPageFailure(t *testing.T) {
	base := time.Date(2026, 9, 11, 0, 0, 0, 0, time.Local)
	var n int
	var mu sync.Mutex
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		n++
		cur := n
		mu.Unlock()
		if cur > 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(lsjzBody(lsjzRows(base, lsjzPageSize)...)))
	}))
	t.Cleanup(srv.Close)

	p := NewFundCNProvider(srv.Client())
	p.lsjzBaseURL = srv.URL + "/f10/lsjz"

	points, err := p.History(contextOf(), "110022", 365)
	if err != nil {
		t.Fatalf("已有首页数据时中间页失败应降级返回部分结果，got err=%v", err)
	}
	if len(points) != lsjzPageSize {
		t.Fatalf("len=%d want %d", len(points), lsjzPageSize)
	}
}

// IsFundCNSymbol 为 FundCN 与 Yahoo guard 共用的唯一判定，handler 亦复用（防正则两处漂移）。
func TestIsFundCNSymbol(t *testing.T) {
	for _, sym := range []string{"110022", "000001", "999999"} {
		if !IsFundCNSymbol(sym) {
			t.Fatalf("IsFundCNSymbol(%q) = false, want true", sym)
		}
	}
	for _, sym := range []string{"12345", "1100221", "", "11002A", " 110022", "600519.SS", "GOLD_CNY_G", "１１００２２"} {
		if IsFundCNSymbol(sym) {
			t.Fatalf("IsFundCNSymbol(%q) = true, want false", sym)
		}
	}
}
