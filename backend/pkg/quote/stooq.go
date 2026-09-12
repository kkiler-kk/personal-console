package quote

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const (
	stooqBaseURL = "https://stooq.com/q/l/"
	// stooqFields 为轻量报价字段序列：s=symbol d2=date t2=time o/h/l/c=OHLC v=volume。
	stooqFields = "sd2t2ohlcv"
	// stooqNoData 为 Stooq 无数据占位符。
	stooqNoData = "N/D"
	// stooqMinCols 为可用数据行最少列数：Symbol,Date,Time,Open,High,Low,Close[,Volume]。
	stooqMinCols = 7
	// stooqCloseIdx 为 Close 在 CSV 行中的下标（0 基）。
	stooqCloseIdx = 6
)

// StooqProvider 为二级降级源（Yahoo 之后），使用 stooq.com 轻量 CSV 接口。
// 仅提供 Fetch（收盘/现货价），History 不支持（返回 ErrUnsupported）。
// PreviousClose 恒为 0（Stooq 不提供昨收）。baseURL 小写字段仅供同包测试注入。
type StooqProvider struct {
	client  *http.Client
	baseURL string
}

// NewStooqProvider 构造 Stooq 降级源；client 为 nil 时使用默认 10s 超时直连。
func NewStooqProvider(client *http.Client) *StooqProvider {
	if client == nil {
		client = &http.Client{Timeout: defaultHTTPTimeout}
	}
	return &StooqProvider{client: client, baseURL: stooqBaseURL}
}

// Name 实现 Provider。
func (s *StooqProvider) Name() string { return "stooq" }

// mapStooqSymbol 将内部 symbol 映射为 Stooq 代码：
//   - "GC=F"  → "xauusd"（现货金，作 COMEX 期货的近似兜底）
//   - "CNY=X" → "usdcny"
//   - 纯字母（允许点号，如 BRK.B）→ strings.ToLower(symbol) + ".us"（美股）
//   - 其余（含下划线/数字/'=' 的其他 symbol，如 GOLD_CNY_G、0700.HK）→ 不支持
func mapStooqSymbol(symbol string) (string, bool) {
	switch symbol {
	case "GC=F":
		return "xauusd", true
	case "CNY=X":
		return "usdcny", true
	}
	if symbol == "" {
		return "", false
	}
	letters := 0
	for _, r := range symbol {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z':
			letters++
		case r == '.':
			// 允许点号，但整串需至少含一个字母（见下方 letters==0 判定）。
		default:
			return "", false
		}
	}
	if letters == 0 {
		return "", false // 全是点号，无字母
	}
	return strings.ToLower(symbol) + ".us", true
}

// stooqCurrency 按映射后的代码推断计价货币。
func stooqCurrency(mapped string) string {
	switch {
	case mapped == "usdcny":
		return "CNY"
	case mapped == "xauusd", strings.HasSuffix(mapped, ".us"):
		return "USD"
	default:
		return ""
	}
}

// Fetch 实现 Provider：请求 CSV，取第二行 Close 为价格。
// 非 200 / 无数据行 / 短行 / Close 为 "N/D" 或 <=0 → error（降级链静默跳到下一个）。
func (s *StooqProvider) Fetch(ctx context.Context, symbol string) (*RawQuote, error) {
	mapped, ok := mapStooqSymbol(symbol)
	if !ok {
		return nil, ErrUnsupported
	}
	endpoint := fmt.Sprintf("%s?s=%s&f=%s&h&e=csv", s.baseURL, url.QueryEscape(mapped), stooqFields)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("stooq: build request for %s: %w", symbol, err)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("stooq: fetch %s: %w", symbol, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("stooq: fetch %s: http %d", symbol, resp.StatusCode)
	}

	reader := csv.NewReader(resp.Body)
	reader.FieldsPerRecord = -1 // 容忍列数不一致，由下方短行检查兜底
	records, err := reader.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("stooq: parse csv %s: %w", symbol, err)
	}
	if len(records) < 2 {
		return nil, fmt.Errorf("stooq: fetch %s: no data row", symbol)
	}
	row := records[1]
	if len(row) < stooqMinCols {
		return nil, fmt.Errorf("stooq: fetch %s: short row (%d cols)", symbol, len(row))
	}
	closeField := strings.TrimSpace(row[stooqCloseIdx])
	if closeField == "" || strings.EqualFold(closeField, stooqNoData) {
		return nil, fmt.Errorf("stooq: fetch %s: no data (close=%q)", symbol, closeField)
	}
	price, err := strconv.ParseFloat(closeField, 64)
	if err != nil {
		return nil, fmt.Errorf("stooq: parse close %s %q: %w", symbol, closeField, err)
	}
	if price <= 0 {
		return nil, fmt.Errorf("stooq: fetch %s: invalid close %v", symbol, price)
	}
	return &RawQuote{Price: price, PreviousClose: 0, Currency: stooqCurrency(mapped)}, nil
}

// History 实现 Provider：Stooq 轻量接口不提供历史，始终 ErrUnsupported（降级链跳过）。
func (s *StooqProvider) History(_ context.Context, _ string, _ int) ([]HistoryPoint, error) {
	return nil, ErrUnsupported
}
