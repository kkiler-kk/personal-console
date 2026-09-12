package quote

// fundamentals：Yahoo v7 批量 PE(TTM)。
//
// v7 quote 接口需要 crumb，完整流程（crumb 流程要点）：
//  1. GET fc.yahoo.com —— 任意状态码均属预期（404 也要），目的只是让 Set-Cookie 落进 cookiejar；
//  2. GET /v1/test/getcrumb（带 UA）—— 200 且 body 非空非 HTML（"<" 开头判废）→ 内存缓存（mutex 保护）；
//  3. GET v7 quote?symbols=…&crumb=… —— 401/403 视为 crumb 失效：invalidate + 重取 + 重试一次（仅一次，防循环）。
//
// PEs 永不返回 error：任何失败都降级为 null + log，并写 null 缓存防穿透；
// positions 端点因此恒 200（全局约束）。

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"

	"github.com/go-redis/redis/v8"
)

const (
	// crumb 流程真实地址；Service 上的小写字段 fcBaseURL/crumbBaseURL/v7BaseURL
	// 仅供同包测试注入（与 YahooProvider.baseURL 同款模式）。
	fundCookieURL = "https://fc.yahoo.com"
	crumbURL      = "https://query1.finance.yahoo.com/v1/test/getcrumb"
	v7QuoteURL    = "https://query1.finance.yahoo.com/v7/finance/quote"

	fundCachePrefix = "fund:"
	fundCacheTTL    = 3600 * time.Second

	crumbMaxBody = 512 // crumb 为短字符串；截断超长响应（HTML 错误页等）
)

// Fundamentals 为 Redis "fund:<symbol>" 缓存条目的序列化结构。
type Fundamentals struct {
	PEttm *float64 `json:"pe_ttm"` // null = 无数据（ETF 部分有、期货/指数无）
}

// v7Envelope 只声明用到的字段；trailingPE 用 *float64（字段缺失/null 安全）。
type v7Envelope struct {
	QuoteResponse struct {
		Result []struct {
			Symbol     string   `json:"symbol"`
			TrailingPE *float64 `json:"trailingPE"`
		} `json:"result"`
	} `json:"quoteResponse"`
}

// newFundClient 构造 fundamentals 独立 client：带 cookiejar（crumb 流程需要
// 存 fc.yahoo.com 种的 cookie），复用 base 的 Transport（代理配置）与 Timeout。
// 独立于共享 s.client（其无 jar），最小侵入。cookiejar.Jar 自身并发安全。
func newFundClient(base *http.Client) *http.Client {
	if base == nil {
		base = &http.Client{Timeout: defaultHTTPTimeout}
	}
	jar, err := cookiejar.New(nil)
	if err != nil {
		// cookiejar.New(nil) 实际不会失败（仅非法 PublicSuffixList 报错）；防御性降级。
		log.Printf("quote: cookiejar init failed: %v (fundamentals crumb flow will likely fail)", err)
		return &http.Client{Timeout: base.Timeout, Transport: base.Transport}
	}
	return &http.Client{Timeout: base.Timeout, Transport: base.Transport, Jar: jar}
}

// getCrumb 返回内存缓存的 crumb；miss 时走种 cookie + getcrumb 两步重取。
// 全程持 crumbMu：并发 miss 只触发一次网络重取（防击穿），crumb 字段读写受锁保护。
// 锁内含 HTTP 调用，最坏受 fundClient.Timeout 约束，不会长期悬挂。
func (s *Service) getCrumb(ctx context.Context) (string, error) {
	s.crumbMu.Lock()
	defer s.crumbMu.Unlock()
	if s.crumb != "" {
		return s.crumb, nil
	}

	// 第一步：种 cookie。fc.yahoo.com 返回任意状态码均属预期，只为 Set-Cookie 进 jar。
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.fcBaseURL, nil)
	if err != nil {
		return "", fmt.Errorf("quote: build fc request: %w", err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)
	resp, err := s.fundClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("quote: seed yahoo cookie: %w", err)
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, crumbMaxBody)) // 排空以利连接复用
	_ = resp.Body.Close()

	// 第二步：getcrumb（带 UA；cookie 由 jar 自动携带）。
	req, err = http.NewRequestWithContext(ctx, http.MethodGet, s.crumbBaseURL, nil)
	if err != nil {
		return "", fmt.Errorf("quote: build getcrumb request: %w", err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)
	resp, err = s.fundClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("quote: getcrumb: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("quote: getcrumb http %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, crumbMaxBody))
	if err != nil {
		return "", fmt.Errorf("quote: read getcrumb body: %w", err)
	}
	crumb := strings.TrimSpace(string(body))
	if crumb == "" || strings.HasPrefix(crumb, "<") { // 空 / HTML 错误页 → 判废
		return "", fmt.Errorf("quote: getcrumb returned invalid body %q", crumb)
	}
	s.crumb = crumb
	return crumb, nil
}

// invalidateCrumb 失效内存 crumb（v7 返回 401/403 时调用）。
func (s *Service) invalidateCrumb() {
	s.crumbMu.Lock()
	s.crumb = ""
	s.crumbMu.Unlock()
}

// requestV7 单次 v7 批量 quote 请求；返回解析结果与 HTTP 状态码（供 401/403 判定）。
// symbols 逐个 QueryEscape 后逗号连接（brief 写 PathEscape；查询串语境下 QueryEscape
// 才能正确转义 '='/'+' 等字符，服务端解码结果一致，实测 Yahoo 接受）。
func (s *Service) requestV7(ctx context.Context, symbols []string, crumb string) (map[string]*float64, int, error) {
	escaped := make([]string, 0, len(symbols))
	for _, sym := range symbols {
		escaped = append(escaped, url.QueryEscape(sym))
	}
	endpoint := s.v7BaseURL + "?symbols=" + strings.Join(escaped, ",") + "&crumb=" + url.QueryEscape(crumb)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("quote: build v7 request: %w", err)
	}
	req.Header.Set("User-Agent", yahooUserAgent)
	resp, err := s.fundClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("quote: v7 fetch: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("quote: v7 http %d", resp.StatusCode)
	}
	var env v7Envelope
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("quote: v7 decode: %w", err)
	}
	out := make(map[string]*float64, len(env.QuoteResponse.Result))
	for _, r := range env.QuoteResponse.Result {
		out[r.Symbol] = r.TrailingPE // 字段缺失/null → nil 条目
	}
	return out, resp.StatusCode, nil
}

// fetchPEs 走 crumb + v7 一次批量请求；401/403 → 失效重取 crumb 并重试一次（仅一次）。
// 重试后仍失败（含其它状态码/网络错误）→ error，由 PEs 降级。
func (s *Service) fetchPEs(ctx context.Context, symbols []string) (map[string]*float64, error) {
	crumb, err := s.getCrumb(ctx)
	if err != nil {
		return nil, err
	}
	pes, status, err := s.requestV7(ctx, symbols, crumb)
	if err == nil {
		return pes, nil
	}
	if status != http.StatusUnauthorized && status != http.StatusForbidden {
		return nil, err
	}
	log.Printf("quote: v7 returned %d, refreshing crumb and retrying once", status)
	s.invalidateCrumb()
	crumb, err = s.getCrumb(ctx)
	if err != nil {
		return nil, err
	}
	pes, _, err = s.requestV7(ctx, symbols, crumb)
	if err != nil {
		return nil, err
	}
	return pes, nil
}

// PEs 批量取 PE(TTM)，永不返回 error：
//  1. 逐 symbol 查 Redis "fund:<symbol>"（JSON {"pe_ttm":...}），命中直返（null 也算命中，防穿透）；
//  2. miss 的 symbols 经 crumb+v7 一次批量请求（manual/GoldSymbol 由调用方剔除，本方法按传入即查）；
//  3. 成功：有值写值、字段缺失写 null，SETEX 3600s；
//  4. 失败：全部 miss symbol 写 null 缓存 + log。
//
// 返回 map 中查不到的 symbol（含 v7 未返回者）为 nil 值条目；
// 空/重复/空串 symbols 安全：空入参零网络零 Redis，返回空 map。
func (s *Service) PEs(ctx context.Context, symbols []string) map[string]*float64 {
	out := make(map[string]*float64, len(symbols))
	miss := make([]string, 0, len(symbols))
	for _, sym := range symbols {
		if sym == "" {
			continue
		}
		if _, ok := out[sym]; ok {
			continue
		}
		out[sym] = nil // 默认 nil 条目：缓存 miss 且 v7 缺席/失败时保持
		if pe, ok := s.cachedFundamental(ctx, sym); ok {
			out[sym] = pe
			continue
		}
		miss = append(miss, sym)
	}
	if len(miss) == 0 {
		return out
	}

	fetched, err := s.fetchPEs(ctx, miss)
	if err != nil {
		// 全链失败：只降级 + log；null 也缓存（防穿透），TTL 同 3600s。
		log.Printf("quote: fundamentals fetch failed for %d symbols: %v", len(miss), err)
		for _, sym := range miss {
			s.cacheFundamental(ctx, sym, nil)
		}
		return out
	}
	for _, sym := range miss {
		pe := fetched[sym] // v7 未返回该 symbol → nil
		out[sym] = pe
		s.cacheFundamental(ctx, sym, pe)
	}
	return out
}

// cachedFundamental 读 Redis 1h 缓存；Redis 不可用/miss/脏数据均按 miss 处理
// （脏条目会被本次 SETEX 覆盖）。ok=true 时 pe 可为 nil（缓存的 null 条目）。
func (s *Service) cachedFundamental(ctx context.Context, symbol string) (*float64, bool) {
	if s.rdb == nil {
		return nil, false
	}
	data, err := s.rdb.Get(ctx, fundCachePrefix+symbol).Bytes()
	if err != nil {
		if !errors.Is(err, redis.Nil) {
			log.Printf("quote: redis get fund:%s: %v", symbol, err)
		}
		return nil, false
	}
	var f Fundamentals
	if err := json.Unmarshal(data, &f); err != nil {
		log.Printf("quote: corrupted fund cache %s: %v", symbol, err)
		return nil, false
	}
	return f.PEttm, true
}

// cacheFundamental 写 Redis 1h 缓存（best-effort；null 也写，防失败穿透）。
func (s *Service) cacheFundamental(ctx context.Context, symbol string, pe *float64) {
	if s.rdb == nil {
		return
	}
	data, err := json.Marshal(Fundamentals{PEttm: pe})
	if err != nil {
		log.Printf("quote: marshal fund cache %s: %v", symbol, err)
		return
	}
	if err := s.rdb.Set(ctx, fundCachePrefix+symbol, data, fundCacheTTL).Err(); err != nil {
		log.Printf("quote: redis set fund:%s: %v", symbol, err)
	}
}
