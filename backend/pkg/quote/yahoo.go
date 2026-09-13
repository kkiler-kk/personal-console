package quote

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"time"
)

const (
	yahooBaseURL   = "https://query1.finance.yahoo.com/v8/finance/chart/"
	yahooUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
)

// YahooProvider 使用 Yahoo v8 chart API（无需 crumb）获取行情与历史。
// quote:   ?range=1d&interval=1d → chart.result[0].meta
// history: ?range=1y&interval=1d → timestamp[] + indicators.quote[0].close[]
// client 由 Service 注入（可带代理）；baseURL 小写字段仅供同包测试注入。
type YahooProvider struct {
	client  *http.Client
	baseURL string
}

// NewYahooProvider 构造 Yahoo 一级源；client 为 nil 时使用默认 10s 超时直连。
func NewYahooProvider(client *http.Client) *YahooProvider {
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &YahooProvider{client: client, baseURL: yahooBaseURL}
}

// Name 实现 Provider。
func (y *YahooProvider) Name() string { return "yahoo" }

// chartEnvelope 只声明用到的字段。
type chartEnvelope struct {
	Chart struct {
		Result []chartResult `json:"result"`
	} `json:"chart"`
}

type chartResult struct {
	Meta struct {
		RegularMarketPrice float64 `json:"regularMarketPrice"`
		PreviousClose      float64 `json:"previousClose"`
		ChartPreviousClose float64 `json:"chartPreviousClose"`
		Currency           string  `json:"currency"`
	} `json:"meta"`
	Timestamp  []int64 `json:"timestamp"`
	Indicators struct {
		Quote []struct {
			Close []*float64 `json:"close"`
		} `json:"quote"`
	} `json:"indicators"`
}

// getChart 请求 chart API 并返回第一个 result；非 200 / result 空 → error。
func (y *YahooProvider) getChart(ctx context.Context, symbol, query string) (*chartResult, error) {
	endpoint := y.baseURL + url.PathEscape(symbol) + "?" + query
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("yahoo: build request for %s: %w", symbol, err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)

	resp, err := y.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("yahoo: fetch %s: %w", symbol, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("yahoo: fetch %s: http %d", symbol, resp.StatusCode)
	}

	var env chartEnvelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, fmt.Errorf("yahoo: decode %s: %w", symbol, err)
	}
	if len(env.Chart.Result) == 0 {
		return nil, fmt.Errorf("yahoo: fetch %s: empty chart result", symbol)
	}
	return &env.Chart.Result[0], nil
}

// Fetch 实现 Provider：regularMarketPrice<=0 视为失败；
// previousClose 缺失（0）时回退 chartPreviousClose。
//
// 裸 6 位数字（如 "110022"）是中国场外基金代码，Yahoo 不认识，直接 ErrUnsupported
// 让降级链尽快走到 FundCNProvider（末位），省掉一次注定 404 的外网往返。
// A 股代码带交易所后缀（600519.SS）不匹配该形态，仍由本 provider 处理。
func (y *YahooProvider) Fetch(ctx context.Context, symbol string) (*RawQuote, error) {
	if IsFundCNSymbol(symbol) {
		return nil, ErrUnsupported
	}
	res, err := y.getChart(ctx, symbol, "range=1d&interval=1d")
	if err != nil {
		return nil, err
	}
	price := res.Meta.RegularMarketPrice
	if price <= 0 {
		return nil, fmt.Errorf("yahoo: fetch %s: invalid price %v", symbol, price)
	}
	prev := res.Meta.PreviousClose
	if prev == 0 {
		prev = res.Meta.ChartPreviousClose
	}
	return &RawQuote{Price: price, PreviousClose: prev, Currency: res.Meta.Currency}, nil
}

// History 实现 Provider：固定取 1y（days 参数的超集，调用方自行截取）；
// close 为 null 的点跳过；日期归一到当日 00:00 UTC。全部为空视为失败，
// 以便降级链继续尝试下一个 provider。
//
// 裸 6 位数字基金码与 Fetch 同理直接让位给 FundCNProvider（guard 两处必须一致）。
func (y *YahooProvider) History(ctx context.Context, symbol string, days int) ([]HistoryPoint, error) {
	if IsFundCNSymbol(symbol) {
		return nil, ErrUnsupported
	}
	_ = days // Yahoo 固定 range=1y，days 仅用于接口统一/日志
	res, err := y.getChart(ctx, symbol, "range=1y&interval=1d")
	if err != nil {
		return nil, err
	}
	if len(res.Indicators.Quote) == 0 {
		return nil, fmt.Errorf("yahoo: history %s: no quote indicators", symbol)
	}
	closes := res.Indicators.Quote[0].Close

	points := make([]HistoryPoint, 0, len(res.Timestamp))
	for i, ts := range res.Timestamp {
		if i >= len(closes) || closes[i] == nil {
			continue
		}
		points = append(points, HistoryPoint{
			Date:  time.Unix(ts, 0).UTC().Truncate(24 * time.Hour),
			Close: *closes[i],
		})
	}
	if len(points) == 0 {
		return nil, fmt.Errorf("yahoo: history %s: no valid points", symbol)
	}
	return points, nil
}
