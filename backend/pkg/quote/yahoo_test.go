package quote

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

// yahooQuoteBody 为 Yahoo v8 chart API 的最小可用响应 fixture。
const yahooQuoteBody = `{"chart":{"result":[{"meta":{"regularMarketPrice":228.5,"previousClose":225.1,"currency":"USD"},"timestamp":[1757548800,1757635200],"indicators":{"quote":[{"close":[226.0,228.5]}]}}],"error":null}}`

// newJSONServer 返回固定 status+body 的 httptest 服务，并校验 User-Agent。
func newJSONServer(t *testing.T, status int, body string) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if ua := r.Header.Get("User-Agent"); ua != yahooUserAgent {
			t.Errorf("User-Agent = %q, want %q", ua, yahooUserAgent)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newTestProvider(srv *httptest.Server) *YahooProvider {
	y := NewYahooProvider(srv.Client())
	y.baseURL = srv.URL + "/v8/finance/chart/"
	return y
}

func TestYahooFetchAndHistory(t *testing.T) {
	srv := newJSONServer(t, http.StatusOK, yahooQuoteBody)
	y := newTestProvider(srv)

	q, err := y.Fetch(context.Background(), "AAPL")
	if err != nil {
		t.Fatal(err)
	}
	if q.Price != 228.5 || q.PreviousClose != 225.1 || q.Currency != "USD" {
		t.Fatalf("q=%+v", q)
	}

	h, err := y.History(context.Background(), "AAPL", 365)
	if err != nil {
		t.Fatal(err)
	}
	if len(h) != 2 || h[0].Close != 226.0 || h[1].Close != 228.5 {
		t.Fatalf("h=%+v", h)
	}
	want0 := time.Date(2025, 9, 11, 0, 0, 0, 0, time.UTC)
	want1 := time.Date(2025, 9, 12, 0, 0, 0, 0, time.UTC)
	if !h[0].Date.Equal(want0) || !h[1].Date.Equal(want1) {
		t.Fatalf("dates=%v,%v want %v,%v", h[0].Date, h[1].Date, want0, want1)
	}
}

func TestYahooErrorPath(t *testing.T) {
	srv := newJSONServer(t, http.StatusInternalServerError, `{"chart":{"error":"boom"}}`)
	y := newTestProvider(srv)

	if _, err := y.Fetch(context.Background(), "X"); err == nil {
		t.Fatal("want error on 500")
	}
	if _, err := y.History(context.Background(), "X", 30); err == nil {
		t.Fatal("want error on 500 (history)")
	}
}

func TestYahooEmptyResultIsError(t *testing.T) {
	srv := newJSONServer(t, http.StatusOK, `{"chart":{"result":[],"error":null}}`)
	y := newTestProvider(srv)
	if _, err := y.Fetch(context.Background(), "NOPE"); err == nil {
		t.Fatal("want error on empty result")
	}
}

func TestYahooZeroPriceIsError(t *testing.T) {
	body := `{"chart":{"result":[{"meta":{"regularMarketPrice":0,"previousClose":225.1,"currency":"USD"},"timestamp":[],"indicators":{"quote":[{"close":[]}]}}],"error":null}}`
	srv := newJSONServer(t, http.StatusOK, body)
	y := newTestProvider(srv)
	if _, err := y.Fetch(context.Background(), "ZERO"); err == nil {
		t.Fatal("want error when regularMarketPrice <= 0")
	}
}

func TestYahooPreviousCloseFallback(t *testing.T) {
	body := `{"chart":{"result":[{"meta":{"regularMarketPrice":100.5,"chartPreviousClose":99.25,"currency":"HKD"},"timestamp":[1757548800],"indicators":{"quote":[{"close":[100.5]}]}}],"error":null}}`
	srv := newJSONServer(t, http.StatusOK, body)
	y := newTestProvider(srv)

	q, err := y.Fetch(context.Background(), "0700.HK")
	if err != nil {
		t.Fatal(err)
	}
	if q.PreviousClose != 99.25 {
		t.Fatalf("PreviousClose=%v want chartPreviousClose 99.25", q.PreviousClose)
	}
	if q.Currency != "HKD" {
		t.Fatalf("Currency=%v", q.Currency)
	}
}

func TestYahooHistorySkipsNullClose(t *testing.T) {
	body := `{"chart":{"result":[{"meta":{"regularMarketPrice":10,"currency":"USD"},"timestamp":[1757462400,1757548800,1757635200],"indicators":{"quote":[{"close":[225.0,null,228.5]}]}}],"error":null}}`
	srv := newJSONServer(t, http.StatusOK, body)
	y := newTestProvider(srv)

	h, err := y.History(context.Background(), "AAPL", 365)
	if err != nil {
		t.Fatal(err)
	}
	if len(h) != 2 {
		t.Fatalf("null close should be skipped, h=%+v", h)
	}
	if h[0].Close != 225.0 || !h[0].Date.Equal(time.Date(2025, 9, 10, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("h[0]=%+v", h[0])
	}
	if h[1].Close != 228.5 || !h[1].Date.Equal(time.Date(2025, 9, 12, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("h[1]=%+v", h[1])
	}
}

func TestYahooSymbolPathEscaped(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.EscapedPath()
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(yahooQuoteBody))
	}))
	t.Cleanup(srv.Close)
	y := newTestProvider(srv)

	// 契约：请求路径 = baseURL + url.PathEscape(symbol)。
	// 注意 '=' 是 RFC 3986 sub-delim，PathEscape 按规范不转义（Yahoo 亦接受 "CNY=X" 原样路径）。
	if _, err := y.Fetch(context.Background(), "XAUUSD=X"); err != nil {
		t.Fatal(err)
	}
	if want := "/v8/finance/chart/" + url.PathEscape("XAUUSD=X"); gotPath != want {
		t.Fatalf("escaped path = %q, want %q", gotPath, want)
	}

	// 含空格/特殊字符的 symbol 必须被转义。
	if _, err := y.Fetch(context.Background(), "BTC USD?"); err != nil {
		t.Fatal(err)
	}
	if want := "/v8/finance/chart/" + url.PathEscape("BTC USD?"); gotPath != want {
		t.Fatalf("escaped path = %q, want %q", gotPath, want)
	}
}
