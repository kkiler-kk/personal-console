package quote

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-redis/redis/v8"
)

// v7FixtureBody 为 brief 提供的 v7 响应 fixture（逐字）：
// AAPL 有 trailingPE，GC=F 字段缺失（期货无 PE）→ 解析为 nil 条目。
const v7FixtureBody = `{"quoteResponse":{"result":[{"symbol":"AAPL","trailingPE":31.4},{"symbol":"GC=F"}],"error":null}}`

// fakeFundServer 用单个 httptest 服务模拟 crumb 流程三端点：
//   - /fc        种 cookie（返回 404 属预期——实现必须忽略状态码，只要 Set-Cookie）
//   - /getcrumb  按调用序号返回可编程 (status, body)，校验 UA
//   - /v7/quote  按调用序号返回可编程 (status, body)，校验 cookie 已带上
type fakeFundServer struct {
	srv        *httptest.Server
	fcCalls    atomic.Int32
	crumbCalls atomic.Int32
	v7Calls    atomic.Int32

	crumbResp func(n int32) (int, string)
	v7Resp    func(n int32, q url.Values) (int, string)
}

func newFakeFundServer(t *testing.T,
	crumbResp func(n int32) (int, string),
	v7Resp func(n int32, q url.Values) (int, string)) *fakeFundServer {
	t.Helper()
	f := &fakeFundServer{crumbResp: crumbResp, v7Resp: v7Resp}
	mux := http.NewServeMux()
	mux.HandleFunc("/fc", func(w http.ResponseWriter, r *http.Request) {
		f.fcCalls.Add(1)
		http.SetCookie(w, &http.Cookie{Name: "A3", Value: "seeded-cookie", Path: "/"})
		w.WriteHeader(http.StatusNotFound) // 真实 fc.yahoo.com 对无 cookie 请求即返回 404 + Set-Cookie
	})
	mux.HandleFunc("/getcrumb", func(w http.ResponseWriter, r *http.Request) {
		if ua := r.Header.Get("User-Agent"); ua != yahooUserAgent {
			t.Errorf("getcrumb User-Agent = %q, want %q", ua, yahooUserAgent)
		}
		status, body := f.crumbResp(f.crumbCalls.Add(1))
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	})
	mux.HandleFunc("/v7/quote", func(w http.ResponseWriter, r *http.Request) {
		if ck, err := r.Cookie("A3"); err != nil || ck.Value == "" {
			t.Errorf("v7 request missing cookie seeded via /fc: %v", err)
		}
		status, body := f.v7Resp(f.v7Calls.Add(1), r.URL.Query())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

// newFundTestService 构造注入三个 baseURL 的 Service（与 YahooProvider.baseURL 同款模式）。
func newFundTestService(f *fakeFundServer, rdb *redis.Client) *Service {
	s := newServiceWithProviders(nil, nil, rdb)
	s.fcBaseURL = f.srv.URL + "/fc"
	s.crumbBaseURL = f.srv.URL + "/getcrumb"
	s.v7BaseURL = f.srv.URL + "/v7/quote"
	return s
}

// testRedisClient 连真 Redis（docker 起着，无 miniredis 依赖）；不可达则 Skip 缓存断言。
func testRedisClient(t *testing.T) *redis.Client {
	t.Helper()
	rdb := redis.NewClient(&redis.Options{Addr: "127.0.0.1:6379"})
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := rdb.Ping(ctx).Err(); err != nil {
		_ = rdb.Close()
		t.Skipf("real redis unavailable, skipping cache assertions: %v", err)
	}
	t.Cleanup(func() { _ = rdb.Close() })
	return rdb
}

// fundTestKeys 清理测试专用 Redis 键（前置去污染 + 后置还原，避免与真数据互扰）。
func fundTestKeys(t *testing.T, rdb *redis.Client, keys ...string) {
	t.Helper()
	ctx := context.Background()
	if err := rdb.Del(ctx, keys...).Err(); err != nil {
		t.Fatalf("pre-clean redis keys: %v", err)
	}
	t.Cleanup(func() { _ = rdb.Del(context.Background(), keys...).Err() })
}

func TestFundamentalsPEsBatchParse(t *testing.T) {
	f := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusOK, "CRUMB123" },
		func(n int32, q url.Values) (int, string) {
			if n == 1 { // 首次批量：两 symbol 一次请求
				if syms := q.Get("symbols"); syms != "AAPL,GC=F" {
					t.Errorf("v7 symbols = %q, want %q", syms, "AAPL,GC=F")
				}
			}
			if crumb := q.Get("crumb"); crumb != "CRUMB123" {
				t.Errorf("v7 crumb = %q, want CRUMB123", crumb)
			}
			return http.StatusOK, v7FixtureBody
		})
	s := newFundTestService(f, nil) // rdb=nil：纯 httptest，不碰 Redis
	ctx := context.Background()

	got := s.PEs(ctx, []string{"AAPL", "GC=F"})
	if len(got) != 2 {
		t.Fatalf("len=%d want 2, got=%v", len(got), got)
	}
	if pe := got["AAPL"]; pe == nil || *pe != 31.4 {
		t.Fatalf("AAPL pe=%v want 31.4", pe)
	}
	if pe, ok := got["GC=F"]; !ok || pe != nil {
		t.Fatalf("GC=F want present nil entry, ok=%v pe=%v", ok, pe)
	}
	if f.fcCalls.Load() != 1 || f.crumbCalls.Load() != 1 || f.v7Calls.Load() != 1 {
		t.Fatalf("calls fc=%d crumb=%d v7=%d, want 1/1/1（一次批量请求）",
			f.fcCalls.Load(), f.crumbCalls.Load(), f.v7Calls.Load())
	}

	// 空 symbols：零网络请求，返回空 map。
	if empty := s.PEs(ctx, nil); len(empty) != 0 {
		t.Fatalf("empty symbols want empty map, got=%v", empty)
	}
	if n := f.v7Calls.Load(); n != 1 {
		t.Fatalf("empty symbols triggered v7 (calls=%d)", n)
	}

	// crumb 内存缓存：第二次 PEs 不再种 cookie / 取 crumb，只打 v7。
	got2 := s.PEs(ctx, []string{"AAPL"})
	if pe := got2["AAPL"]; pe == nil || *pe != 31.4 {
		t.Fatalf("second call AAPL pe=%v", pe)
	}
	if f.crumbCalls.Load() != 1 || f.fcCalls.Load() != 1 || f.v7Calls.Load() != 2 {
		t.Fatalf("after 2nd PEs: fc=%d crumb=%d v7=%d, want 1/1/2（crumb 已缓存）",
			f.fcCalls.Load(), f.crumbCalls.Load(), f.v7Calls.Load())
	}
}

func TestFundamentalsCrumbRefreshRetryOnce(t *testing.T) {
	f := newFakeFundServer(t,
		func(n int32) (int, string) {
			if n == 1 {
				return http.StatusOK, "CRUMB-OLD"
			}
			return http.StatusOK, "CRUMB-NEW"
		},
		func(n int32, q url.Values) (int, string) {
			switch n {
			case 1:
				if crumb := q.Get("crumb"); crumb != "CRUMB-OLD" {
					t.Errorf("first v7 crumb = %q, want CRUMB-OLD", crumb)
				}
				return http.StatusUnauthorized, `{"quoteResponse":{"error":"Invalid Crumb"}}`
			default:
				if crumb := q.Get("crumb"); crumb != "CRUMB-NEW" {
					t.Errorf("retry v7 crumb = %q, want CRUMB-NEW", crumb)
				}
				return http.StatusOK, v7FixtureBody
			}
		})
	s := newFundTestService(f, nil)

	got := s.PEs(context.Background(), []string{"AAPL", "GC=F"})
	if pe := got["AAPL"]; pe == nil || *pe != 31.4 {
		t.Fatalf("AAPL pe=%v want 31.4 after retry", pe)
	}
	if f.crumbCalls.Load() != 2 || f.v7Calls.Load() != 2 {
		t.Fatalf("crumb=%d v7=%d, want 2/2（401 → 失效重取 → 重试成功）",
			f.crumbCalls.Load(), f.v7Calls.Load())
	}
}

func TestFundamentalsRetryIsBounded(t *testing.T) {
	// v7 恒 403：只允许重取 crumb 重试一次（共 2 次 v7），绝不允许无限循环。
	f := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusOK, "CRUMB-X" },
		func(int32, url.Values) (int, string) {
			return http.StatusForbidden, `{"quoteResponse":{"error":"forbidden"}}`
		})
	s := newFundTestService(f, nil)

	got := s.PEs(context.Background(), []string{"AAPL"})
	if pe, ok := got["AAPL"]; !ok || pe != nil {
		t.Fatalf("AAPL want present nil entry, ok=%v pe=%v", ok, pe)
	}
	if f.v7Calls.Load() != 2 || f.crumbCalls.Load() != 2 {
		t.Fatalf("v7=%d crumb=%d, want 2/2（重试只一次）", f.v7Calls.Load(), f.crumbCalls.Load())
	}
}

func TestFundamentalsConcurrentPEs(t *testing.T) {
	// crumbMu 串行化重取：16 个并发 PEs 同时 miss，getcrumb 只应发一次网络请求；
	// 配合 -race 验证 crumb 字段与 cookiejar 的并发安全。
	f := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusOK, "CRUMB-CONC" },
		func(int32, url.Values) (int, string) { return http.StatusOK, v7FixtureBody })
	s := newFundTestService(f, nil)

	const n = 16
	var wg sync.WaitGroup
	results := make([]map[string]*float64, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			results[i] = s.PEs(context.Background(), []string{"AAPL", "GC=F"})
		}(i)
	}
	wg.Wait()

	for i, got := range results {
		if pe := got["AAPL"]; pe == nil || *pe != 31.4 {
			t.Fatalf("goroutine %d AAPL pe=%v want 31.4", i, pe)
		}
	}
	if c := f.crumbCalls.Load(); c != 1 {
		t.Fatalf("crumbCalls=%d want 1（并发 miss 只重取一次）", c)
	}
	if v := f.v7Calls.Load(); v != n {
		t.Fatalf("v7Calls=%d want %d（每 goroutine 一次批量请求）", v, n)
	}
}

func TestFundamentalsChainFailureCachesNull(t *testing.T) {
	rdb := testRedisClient(t)
	const symA, symB = "T251FAIL.A", "T251FAIL.B"
	fundTestKeys(t, rdb, fundCachePrefix+symA, fundCachePrefix+symB)

	f := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusInternalServerError, "boom" }, // getcrumb 恒 500
		func(int32, url.Values) (int, string) {
			t.Error("v7 must not be called when getcrumb fails")
			return http.StatusOK, v7FixtureBody
		})
	s := newFundTestService(f, rdb)
	ctx := context.Background()

	got := s.PEs(ctx, []string{symA, symB}) // 不 panic、不 error
	if len(got) != 2 {
		t.Fatalf("len=%d want 2, got=%v", len(got), got)
	}
	for _, sym := range []string{symA, symB} {
		if pe, ok := got[sym]; !ok || pe != nil {
			t.Fatalf("%s want present nil entry, ok=%v pe=%v", sym, ok, pe)
		}
	}
	if f.v7Calls.Load() != 0 {
		t.Fatalf("v7Calls=%d want 0", f.v7Calls.Load())
	}

	// 缓存写入 null 条目（防穿透），TTL 3600s。
	for _, sym := range []string{symA, symB} {
		val, err := rdb.Get(ctx, fundCachePrefix+sym).Result()
		if err != nil {
			t.Fatalf("redis get fund:%s: %v", sym, err)
		}
		if val != `{"pe_ttm":null}` {
			t.Fatalf("fund:%s = %q, want {\"pe_ttm\":null}", sym, val)
		}
		ttl := rdb.TTL(ctx, fundCachePrefix+sym).Val()
		if ttl <= 0 || ttl > fundCacheTTL {
			t.Fatalf("fund:%s ttl=%v want (0,%v]", sym, ttl, fundCacheTTL)
		}
	}
}

func TestFundamentalsSuccessCachesAndHitSkipsFetch(t *testing.T) {
	rdb := testRedisClient(t)
	const symA, symB = "T251OK.A", "T251OK.B"
	fundTestKeys(t, rdb, fundCachePrefix+symA, fundCachePrefix+symB)

	okBody := `{"quoteResponse":{"result":[{"symbol":"T251OK.A","trailingPE":27.5},{"symbol":"T251OK.B"}],"error":null}}`
	f1 := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusOK, "CRUMB123" },
		func(int32, url.Values) (int, string) { return http.StatusOK, okBody })
	s1 := newFundTestService(f1, rdb)
	ctx := context.Background()

	got := s1.PEs(ctx, []string{symA, symB})
	if pe := got[symA]; pe == nil || *pe != 27.5 {
		t.Fatalf("%s pe=%v want 27.5", symA, pe)
	}
	if pe := got[symB]; pe != nil {
		t.Fatalf("%s pe=%v want nil（字段缺失）", symB, pe)
	}

	// 成功路径也写缓存：有值存值、缺失存 null（防穿透），TTL 3600s。
	if val := rdb.Get(ctx, fundCachePrefix+symA).Val(); val != `{"pe_ttm":27.5}` {
		t.Fatalf("fund:%s = %q", symA, val)
	}
	if val := rdb.Get(ctx, fundCachePrefix+symB).Val(); val != `{"pe_ttm":null}` {
		t.Fatalf("fund:%s = %q", symB, val)
	}
	if ttl := rdb.TTL(ctx, fundCachePrefix+symA).Val(); ttl <= 0 || ttl > fundCacheTTL {
		t.Fatalf("fund:%s ttl=%v", symA, ttl)
	}

	// 新 Service（crumb 缓存为空）命中 Redis → 零 HTTP（fc/getcrumb/v7 全 0 次）。
	f2 := newFakeFundServer(t,
		func(int32) (int, string) { return http.StatusOK, "CRUMB-UNUSED" },
		func(int32, url.Values) (int, string) { return http.StatusOK, okBody })
	s2 := newFundTestService(f2, rdb)

	got2 := s2.PEs(ctx, []string{symA, symB})
	if pe := got2[symA]; pe == nil || *pe != 27.5 {
		t.Fatalf("cached %s pe=%v want 27.5", symA, pe)
	}
	if pe, ok := got2[symB]; !ok || pe != nil {
		t.Fatalf("cached %s want nil entry, ok=%v pe=%v", symB, ok, pe)
	}
	if f2.fcCalls.Load()+f2.crumbCalls.Load()+f2.v7Calls.Load() != 0 {
		t.Fatalf("cache hit triggered HTTP: fc=%d crumb=%d v7=%d",
			f2.fcCalls.Load(), f2.crumbCalls.Load(), f2.v7Calls.Load())
	}
}
