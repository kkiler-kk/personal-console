package quote

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

// contextOf 为测试用 context 便捷别名。
func contextOf() context.Context { return context.Background() }

// newCSVServer 返回固定 body 的 text/csv httptest 服务（t.Cleanup 自动关闭）。
func newCSVServer(t *testing.T, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

// newTestStooq 构造 baseURL 指向 httptest 的 StooqProvider。
func newTestStooq(srv *httptest.Server) *StooqProvider {
	s := NewStooqProvider(srv.Client())
	s.baseURL = srv.URL + "/q/l/"
	return s
}

func TestStooqFetch(t *testing.T) {
	body := "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-09-11,16:15:00,225.0,229.0,224.5,228.5,12345678\n"
	s := newTestStooq(newCSVServer(t, body))

	q, err := s.Fetch(contextOf(), "AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if q.Price != 228.5 || q.Currency != "USD" || q.PreviousClose != 0 {
		t.Fatalf("q=%+v", q)
	}
	// GOLD_CNY_G（含下划线）不被 Stooq 支持。
	if _, err := s.Fetch(contextOf(), "GOLD_CNY_G"); err != ErrUnsupported {
		t.Fatalf("want ErrUnsupported for GOLD_CNY_G, got %v", err)
	}
}

func TestStooqSymbolMappingAndCurrency(t *testing.T) {
	var gotS string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotS = r.URL.Query().Get("s")
		w.Header().Set("Content-Type", "text/csv")
		_, _ = w.Write([]byte("Symbol,Date,Time,Open,High,Low,Close,Volume\nX,2026-09-11,16:15:00,1,1,1,100,1\n"))
	}))
	t.Cleanup(srv.Close)
	s := newTestStooq(srv)

	cases := []struct{ in, wantS, wantCur string }{
		{"AAPL", "aapl.us", "USD"},
		{"MSFT", "msft.us", "USD"},
		{"GC=F", "xauusd", "USD"}, // 期货映射为现货金，且必须小写
		{"CNY=X", "usdcny", "CNY"},
	}
	for _, c := range cases {
		q, err := s.Fetch(contextOf(), c.in)
		if err != nil {
			t.Fatalf("%s: %v", c.in, err)
		}
		if gotS != c.wantS {
			t.Fatalf("%s mapped to s=%q want %q", c.in, gotS, c.wantS)
		}
		if q.Currency != c.wantCur {
			t.Fatalf("%s currency=%q want %q", c.in, q.Currency, c.wantCur)
		}
		if q.Price != 100 {
			t.Fatalf("%s price=%v want 100", c.in, q.Price)
		}
	}
}

func TestStooqUnsupportedSymbols(t *testing.T) {
	s := newTestStooq(newCSVServer(t, "Symbol,Date,Time,Open,High,Low,Close,Volume\nX,2026-09-11,16:15:00,1,1,1,1,1\n"))
	for _, sym := range []string{"GOLD_CNY_G", "0700.HK", "^SPX", "BTC-USD", "", "...", "AAPL US"} {
		if _, err := s.Fetch(contextOf(), sym); err != ErrUnsupported {
			t.Fatalf("%q: want ErrUnsupported, got %v", sym, err)
		}
	}
}

func TestStooqNoDataCloseIsError(t *testing.T) {
	body := "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,N/D,N/D,N/D,N/D,N/D,N/D,N/D\n"
	s := newTestStooq(newCSVServer(t, body))
	if _, err := s.Fetch(contextOf(), "AAPL"); err == nil {
		t.Fatal("want error when close is N/D")
	}
}

func TestStooqZeroCloseIsError(t *testing.T) {
	body := "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-09-11,16:15:00,0,0,0,0,0\n"
	s := newTestStooq(newCSVServer(t, body))
	if _, err := s.Fetch(contextOf(), "AAPL"); err == nil {
		t.Fatal("want error when close <= 0")
	}
}

func TestStooqShortRowIsError(t *testing.T) {
	// 数据行列数不足（畸形/短行）→ error，且不 panic。
	body := "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-09-11,16:15:00,225.0\n"
	s := newTestStooq(newCSVServer(t, body))
	if _, err := s.Fetch(contextOf(), "AAPL"); err == nil {
		t.Fatal("want error on short row")
	}
}

func TestStooqHeaderOnlyIsError(t *testing.T) {
	body := "Symbol,Date,Time,Open,High,Low,Close,Volume\n"
	s := newTestStooq(newCSVServer(t, body))
	if _, err := s.Fetch(contextOf(), "AAPL"); err == nil {
		t.Fatal("want error when only header present")
	}
}

func TestStooqHTTPErrorIsError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	s := newTestStooq(srv)
	if _, err := s.Fetch(contextOf(), "AAPL"); err == nil {
		t.Fatal("want error on http 500")
	}
}

func TestStooqHistoryUnsupported(t *testing.T) {
	s := NewStooqProvider(nil)
	if _, err := s.History(contextOf(), "AAPL", 30); err != ErrUnsupported {
		t.Fatalf("want ErrUnsupported, got %v", err)
	}
	if s.Name() != "stooq" {
		t.Fatalf("name=%q want stooq", s.Name())
	}
}
