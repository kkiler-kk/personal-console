package quote

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// fundMNFInfoURL 为天天基金移动端净值/估值接口（JSON，无 key）。
	// 注：早期公开资料里的 jsonp 估值源 fundgz.1234567.com.cn/js/{code}.js 已下线
	// （2026-09 实测返回 CDN 静态「页面未找到」页），本接口的字段语义与其一一对应：
	// NAV≈dwjz（单位净值）、GSZ≈gsz（盘中估值）、PDATE≈jzrq（净值日期）、GZTIME≈gztime。
	fundMNFInfoURL = "https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo"
	// lsjzURL 为天天基金 f10 历史净值接口；必须带 Referer，否则上游 403。
	lsjzURL = "https://api.fund.eastmoney.com/f10/lsjz"

	// fundCNReferer 为 lsjz 接口的必需来源头（缺失 → 403）。
	fundCNReferer = "http://fundf10.eastmoney.com/"
	// fundCNUserAgent 为浏览器 UA：天天基金对空 UA/非浏览器 UA 的请求会拒绝。
	fundCNUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
	// fundCNDeviceID 为移动端接口的设备标识参数；无鉴权语义，任意稳定串即可。
	fundCNDeviceID = "blog-invest"

	// lsjzPageSize 为 lsjz 单页行数。上游硬上限 20：实测 pageSize=21..200 一律只回 20 行，
	// pageSize≥365 直接回 Data:null（0 行），故钳到 20 并靠翻页凑够 days。
	lsjzPageSize = 20
	// lsjzMaxPages 为单次 History 的翻页上限（20 页 × 20 行 = 400 个净值点，
	// 覆盖 days≤365 的需求），防上游异常或 days 畸大时无限翻页。
	lsjzMaxPages = 20

	// fundDateFormat 为 FSRQ/PDATE 的日期格式。
	fundDateFormat = "2006-01-02"
)

// fundCodePattern 为中国场外公募基金代码：纯 6 位数字。
var fundCodePattern = regexp.MustCompile(`^\d{6}$`)

// IsFundCNSymbol 报告 symbol 是否为中国场外基金代码（^\d{6}$）。
//
// 这是 FundCN 的 symbol 契约，也是全链路的唯一判定来源（避免正则多处漂移）：
//   - FundCNProvider.Fetch/History：不匹配 → ErrUnsupported；
//   - YahooProvider.Fetch/History：匹配 → ErrUnsupported，把裸 6 位数字路由给 FundCN，
//     免得 Yahoo 对 "110022" 发一次注定 404 的请求（A 股代码带交易所后缀如 600519.SS
//     不匹配本正则，仍由 Yahoo 处理）；
//   - handler/asset.go：price_source=fund_cn 时的入参校验。
func IsFundCNSymbol(symbol string) bool { return fundCodePattern.MatchString(symbol) }

// FundCNProvider 为场外中国基金净值源（天天基金/东方财富，无需 key），降级链末位。
//
// symbol 契约：纯 6 位数字（IsFundCNSymbol），其余一律 ErrUnsupported。
// Fetch 取最新单位净值（盘中有估值时用估值），Currency 恒 "CNY"；
// History 取历史净值序列（升序）。
// client 由 Service 注入（可带代理）；两个 baseURL 小写字段仅供同包测试注入。
type FundCNProvider struct {
	client             *http.Client
	fundMNFInfoBaseURL string
	lsjzBaseURL        string
}

// NewFundCNProvider 构造中国基金净值源；client 为 nil 时使用默认 10s 超时直连。
func NewFundCNProvider(client *http.Client) *FundCNProvider {
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &FundCNProvider{
		client:             client,
		fundMNFInfoBaseURL: fundMNFInfoURL,
		lsjzBaseURL:        lsjzURL,
	}
}

// Name 实现 Provider。
func (f *FundCNProvider) Name() string { return "fund_cn" }

// flexFloat 兼容天天基金数值字段的三形态：JSON 字符串（"2.8260"）、JSON 数字（2.826）、null。
// 占位符 "--"、空串、脏字符串与**非有限值**一律按「缺失」处理（0），由调用方判 <=0；
// 单字段畸形不该拖垮整条报价，故解析失败不上抛。
type flexFloat float64

// UnmarshalJSON 实现 json.Unmarshaler。
func (f *flexFloat) UnmarshalJSON(data []byte) error {
	s := strings.TrimSpace(strings.Trim(string(data), `"`))
	*f = 0
	if s == "" || s == "null" || s == "--" {
		return nil
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return nil // 脏数据按缺失处理（含 1e999 这类溢出 → ErrRange）
	}
	// ParseFloat 把字面量 "NaN"/"Inf"/"-Inf"/"Infinity" 解成非有限值且 err==nil，
	// 必须显式拦掉：NaN 能绕过调用方的 <=0 判定（NaN 的任何比较恒 false），
	// 一路进到 json.Marshal（不支持 NaN/Inf）→ gin Render panic → Recovery 500，
	// 击穿「Quotes/positions 永不 error、恒 200」的硬约束；写库也会静默失败。
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	*f = flexFloat(v)
	return nil
}

// fundMNFInfoEnvelope 为 FundMNFInfo 响应外壳（只声明用到的字段；上游另有
// SHORTNAME/ACCNAV/NAVCHGRT/GSZZL/GZTIME 等，本 provider 不需要）。
type fundMNFInfoEnvelope struct {
	Datas []struct {
		FCode string    `json:"FCODE"` // 上游回显的基金代码，用于防串数据
		PDate string    `json:"PDATE"` // 官方净值日期（仅用于错误信息定位）
		NAV   flexFloat `json:"NAV"`   // 单位净值
		GSZ   flexFloat `json:"GSZ"`   // 盘中估值（收盘后/非交易日为 null）
	} `json:"Datas"`
	ErrCode int    `json:"ErrCode"`
	Success bool   `json:"Success"`
	ErrMsg  string `json:"ErrMsg"`
}

// Fetch 实现 Provider：取基金最新净值。
//
// 盘中有估值（GSZ>0）时以估值为 Price、官方净值为 PreviousClose，使日涨跌有语义；
// 收盘后/非交易日 GSZ 为 null → Price 用官方净值、PreviousClose 留 0（当日净值即最新值）。
// 上游回显的 FCODE 与 symbol 不符（含缺失）、或 NAV 缺失/非正/非有限，均视为失败
// （降级链继续 → assets.current_price 兜底），绝不返回来路不明或非有限的价格。
func (f *FundCNProvider) Fetch(ctx context.Context, symbol string) (*RawQuote, error) {
	if !IsFundCNSymbol(symbol) {
		return nil, ErrUnsupported
	}
	query := url.Values{}
	query.Set("Fcodes", symbol)
	query.Set("pageIndex", "1")
	query.Set("pageSize", "1")
	query.Set("plat", "Android")
	query.Set("appType", "ttjj")
	query.Set("product", "EFund")
	query.Set("Version", "1")
	query.Set("deviceid", fundCNDeviceID)

	var env fundMNFInfoEnvelope
	if err := f.getJSON(ctx, f.fundMNFInfoBaseURL+"?"+query.Encode(), "", &env); err != nil {
		return nil, fmt.Errorf("fundcn: fetch %s: %w", symbol, err)
	}
	if !env.Success {
		return nil, fmt.Errorf("fundcn: fetch %s: upstream success=false errcode=%d msg=%q",
			symbol, env.ErrCode, env.ErrMsg)
	}
	if len(env.Datas) == 0 {
		return nil, fmt.Errorf("fundcn: fetch %s: empty Datas", symbol)
	}
	row := env.Datas[0]
	// 严格校验上游回显的代码（实测响应恒含 FCODE，缺失/为空同样视为异常）：
	// 盲信 Datas[0] 时，上游或 CDN 串数据会把别的标的净值静默写进
	// current_price/每日快照/回填历史——记账系统里最坏的一类故障（不可检测的数据损坏）。
	// 宁可这里失败降级到 last-known 兜底，也不接受来路不明的价格。
	if row.FCode != symbol {
		return nil, fmt.Errorf("fundcn: fetch %s: upstream returned FCODE %q (mismatch)", symbol, row.FCode)
	}
	nav := float64(row.NAV)
	if nav <= 0 {
		return nil, fmt.Errorf("fundcn: fetch %s: invalid NAV %v (pdate=%q)", symbol, nav, row.PDate)
	}
	raw := &RawQuote{Price: nav, PreviousClose: 0, Currency: "CNY"}
	if gsz := float64(row.GSZ); gsz > 0 {
		raw.Price, raw.PreviousClose = gsz, nav
	}
	return raw, nil
}

// lsjzRow 为历史净值单行。
type lsjzRow struct {
	FSRQ string    `json:"FSRQ"` // 净值日期
	DWJZ flexFloat `json:"DWJZ"` // 单位净值
}

// lsjzEnvelope 为 f10/lsjz 响应外壳。Data 可为 null（上游拒绝某些 pageSize 时的真实形态）。
type lsjzEnvelope struct {
	Data *struct {
		LSJZList []lsjzRow `json:"LSJZList"`
	} `json:"Data"`
	ErrCode int    `json:"ErrCode"`
	ErrMsg  string `json:"ErrMsg"`
}

// fetchLSJZPage 取历史净值单页（新→旧）。
func (f *FundCNProvider) fetchLSJZPage(ctx context.Context, symbol string, page int) ([]lsjzRow, error) {
	query := url.Values{}
	query.Set("fundCode", symbol)
	query.Set("pageIndex", strconv.Itoa(page))
	query.Set("pageSize", strconv.Itoa(lsjzPageSize))

	var env lsjzEnvelope
	endpoint := f.lsjzBaseURL + "?" + query.Encode()
	if err := f.getJSON(ctx, endpoint, fundCNReferer, &env); err != nil {
		return nil, err
	}
	if env.Data == nil {
		return nil, nil // 上游对越界 pageSize/无数据基金回 Data:null，等价于空页
	}
	return env.Data.LSJZList, nil
}

// History 实现 Provider：翻页取历史净值并转为升序。
//
// 上游按「新→旧」返回且单页硬上限 20 行，故 pageIndex 递增翻页，直到累计点数 ≥ days、
// 遇到空页/短页（数据尽头）或触达 lsjzMaxPages。days<=0 时按一页处理。
// DWJZ 为 "--"/空/非正的行（停牌、无净值日）跳过；FSRQ 解析为本地午夜
// （price_history.date 为 DATE 列，DSN loc=Local，本地午夜可无偏移落库）。
// 首页即失败 → error；后续页失败 → 保留已取点位降级返回。
func (f *FundCNProvider) History(ctx context.Context, symbol string, days int) ([]HistoryPoint, error) {
	if !IsFundCNSymbol(symbol) {
		return nil, ErrUnsupported
	}
	if days <= 0 {
		days = lsjzPageSize
	}
	desc := make([]HistoryPoint, 0, min(days+lsjzPageSize, lsjzMaxPages*lsjzPageSize))
	for page := 1; page <= lsjzMaxPages; page++ {
		rows, err := f.fetchLSJZPage(ctx, symbol, page)
		if err != nil {
			if len(desc) == 0 {
				return nil, fmt.Errorf("fundcn: history %s page %d: %w", symbol, page, err)
			}
			log.Printf("fundcn: history %s page %d failed: %v (keeping %d points)", symbol, page, err, len(desc))
			break
		}
		if len(rows) == 0 {
			break
		}
		short := len(rows) < lsjzPageSize
		for _, row := range rows {
			nav := float64(row.DWJZ)
			if nav <= 0 {
				continue
			}
			date, perr := time.ParseInLocation(fundDateFormat, row.FSRQ, time.Local)
			if perr != nil {
				log.Printf("fundcn: history %s: bad FSRQ %q: %v", symbol, row.FSRQ, perr)
				continue
			}
			desc = append(desc, HistoryPoint{Date: date, Close: nav})
		}
		if short || len(desc) >= days {
			break
		}
	}
	if len(desc) == 0 {
		return nil, fmt.Errorf("fundcn: history %s: no valid points", symbol)
	}
	// 反转为升序，对齐 YahooProvider.History 的输出契约。
	points := make([]HistoryPoint, len(desc))
	for i, p := range desc {
		points[len(desc)-1-i] = p
	}
	return points, nil
}

// getJSON 发起 GET 并把 JSON 响应解到 out；非 200 / 解析失败 → error。
// referer 非空时附带该头（lsjz 必需，缺失上游 403）。
func (f *FundCNProvider) getJSON(ctx context.Context, endpoint, referer string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("User-Agent", fundCNUserAgent)
	if referer != "" {
		req.Header.Set("Referer", referer)
	}
	resp, err := f.client.Do(req)
	if err != nil {
		return fmt.Errorf("do request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("http %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	return nil
}
