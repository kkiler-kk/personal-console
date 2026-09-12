package quote

import (
	"context"
	"fmt"
	"math"
)

// goldFuturesSymbol 为 COMEX 黄金期货代码（USD/盎司）。
// Yahoo 现货 XAUUSD=X 已下线（2026-09-12 实测 404），故用期货；Stooq 以 xauusd 现货近似兜底。
const goldFuturesSymbol = "GC=F"

// ConvertGoldToCNYGram 将国际金价（USD/盎司）按 USDCNY 汇率换算为人民币金价（CNY/克），
// 四舍五入到 2 位小数：xauUSDPerOz / GramsPerTroyOunce * usdCNY。
func ConvertGoldToCNYGram(xauUSDPerOz, usdCNY float64) float64 {
	return math.Round(xauUSDPerOz/GramsPerTroyOunce*usdCNY*100) / 100
}

// goldResolver 实现 GoldResolver：经 Service 的 provider 链 + 缓存路径取
// GC=F（COMEX 金价 USD/oz）与 CNY=X（USDCNY），换算为积存金 CNY/克。
// 任一不可得 → 返回 error，由 fetchFresh 触发 assets 兜底（与普通 symbol 相同路径）。
type goldResolver struct {
	svc *Service
}

// newGoldResolver 绑定到 Service；由 NewService 注入 s.gold。
func newGoldResolver(svc *Service) *goldResolver {
	return &goldResolver{svc: svc}
}

// ResolveGold 实现 GoldResolver。GC=F 与 CNY=X 各自复用 Service.Quotes 的
// 缓存/降级路径（二者均非 GoldSymbol，不会递归回本解析器）。
// 两者价格均 >0 时换算为 CNY/克（Currency="CNY"）；昨收仅在两者 prev 都 >0 时同式换算，否则 0。
func (g *goldResolver) ResolveGold(ctx context.Context) (*RawQuote, error) {
	if g.svc == nil {
		return nil, fmt.Errorf("gold: resolver not bound to a service")
	}
	quotes := g.svc.Quotes(ctx, []string{goldFuturesSymbol, fxSymbol})
	xau, xOK := quotes[goldFuturesSymbol]
	fx, fOK := quotes[fxSymbol]
	if !xOK || !fOK || xau.Price <= 0 || fx.Price <= 0 {
		return nil, fmt.Errorf("gold: cannot resolve %s/%s (xau ok=%v price=%v, fx ok=%v price=%v)",
			goldFuturesSymbol, fxSymbol, xOK, xau.Price, fOK, fx.Price)
	}
	raw := &RawQuote{
		Price:    ConvertGoldToCNYGram(xau.Price, fx.Price),
		Currency: "CNY",
	}
	if xau.PreviousClose > 0 && fx.PreviousClose > 0 {
		raw.PreviousClose = ConvertGoldToCNYGram(xau.PreviousClose, fx.PreviousClose)
	}
	return raw, nil
}
