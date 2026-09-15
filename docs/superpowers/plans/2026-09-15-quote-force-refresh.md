# 迭代六：持仓强制刷新现价 + PE 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 投资页持仓表加「刷新」按钮：一键绕过行情 60s Redis 缓存与 PE(TTM) 1h 缓存，强制拉取全部自动跟踪资产的最新现价与 PE，写回 assets.current_price 并刷新页面数据。

**Architecture:** quote.Service 增加 force 变体（`QuotesForce`/`PEsForce`——跳过缓存读取，其余链路不变：成功仍写缓存+写回价格，失败仍降级 stale/null）；invest handler 新增 `POST /api/invest/refresh` 聚合端点（自动跟踪资产 force 行情 + peSymbols 子集 force PE + DEL dashboard 缓存，返回计数）；前端 InvestPage 持仓区刷新按钮（RefreshCw，pending 旋转）→ mutation 成功 invalidate positions/assets/dashboard + toast 计数。

**Tech Stack:** 同前（前后端均零新依赖）。

**Spec:** 交付后迭代（用户 2026-09-15：「持仓可以加一个刷新按钮 强制刷新现价」+「还有PE这些信息」）

## Global Constraints

- 零新依赖（前后端均是）；`Quotes`/`PEs` 既有公开签名与行为不变（force 为**加法**：新公开方法或参数化私有函数，全部既有消费点零改动）
- force 语义 = 仅跳过**缓存读取**：成功结果仍 `cacheQuote`/`cacheFundamental` 写入（刷新后 60s/1h 内普通请求直接受益）、仍 `writeBackPrice`；失败仍走 staleQuote 降级 / PE null 降级——「行情失败页面永不坏」契约不变
- refresh 端点符号范围与既有谓词逐字一致：行情 = `price_source IN ('yahoo','computed_gold_cny','fund_cn')`（同 service/snapshot.go:103）；PE = invest.go:115-121 peSymbols 逻辑（排除 manual/fund_cn/GoldSymbol）——**不复制粘贴谓词，抽共享或复用既有查询函数**（报告注明选择）
- 成功后 DEL `dashboard:summary`（Redis 惯例，同其他 mutation）
- i18n 三语纪律：新键 invest.refresh*（zh/en/es 齐），check-i18n PASS；zh 既有键值零变化；smoke 11 步零破坏（无需改 smoke——按钮不在断言路径）
- 惯例全沿用（TS strict/e:unknown+instanceof ApiError/tnum/toast/invalidate 键矩阵/Go 错误 `{"error":...}`/PID 精确 kill/8080 PID 2154 与 3000 用户 vite 永不触碰/显式 git add）
- conventional commits

## 文件结构

```
backend/
├── pkg/quote/quote.go          Quotes→quotes(force) 重构 + QuotesForce（Task 1）
├── pkg/quote/fundamentals.go   PEs→pes(force) 重构 + PEsForce（Task 1）
├── handler/invest.go           RefreshQuotes handler（Task 1）
├── router/router.go            POST /invest/refresh 挂路由（Task 1）
frontend/src/
├── lib/api.ts                  refreshInvest()（Task 1）
├── lib/types.ts                RefreshResult 类型（Task 1）
├── pages/invest/InvestPage.tsx 刷新按钮 + mutation（Task 1）
├── i18n/locales/{zh,en,es}.ts  invest.refresh* 增量键（Task 1）
```

---

### Task 1: 强制刷新全栈（单任务迭代）

**Files:** 见文件结构（全部 Task 1 行）

**Interfaces:**
- Consumes: 既有 quote.Service（main.go 注入 invest handler）、InvestPage positions 查询键 ["positions"]/["assets"]/["dashboard"]、toast、useTranslation
- Produces:
  - Go：`(*quote.Service).QuotesForce(ctx, symbols []string) map[string]Quote`、`(*quote.Service).PEsForce(ctx, symbols []string) map[string]*float64`
  - HTTP：`POST /api/invest/refresh` → 200 `{"refreshed_quotes":int,"total_quotes":int,"refreshed_pes":int,"total_pes":int}`（refreshed=非 stale 成功数；无 body；DB/上游全失败也不 500——计数为 0 照常 200，与「行情永不报错」契约一致；仅 DB 查询本身失败才 500 `{"error":...}`）
  - TS：`api.refreshInvest(): Promise<RefreshResult>`；`RefreshResult` 四字段同 JSON

- [ ] **Step 1: quote.go force 化**：`Quotes` 主体抽为私有 `quotes(ctx, symbols, force bool)`（force=true 跳过 `cachedQuote` 分支，其余逐行不变）；`Quotes` = `quotes(...,false)`；新增 `QuotesForce` = `quotes(...,true)`。fundamentals.go 同款：`PEs`→`pes(ctx,symbols,force)`（force 跳过 `cachedFundamental`，**防穿透 null 缓存同样跳过读、成功/null 结果照常写**），`PEsForce` 加法导出
- [ ] **Step 2: handler/invest.go RefreshQuotes**：查自动跟踪符号（复用/抽取 snapshot 同款谓词）→ `QuotesForce` → 统计 `refreshed_quotes`（`!q.Stale` 计数）；查全部 assets 走 peSymbols 过滤（复用 :115-121 既有循环逻辑，可抽小函数）→ `PEsForce` → `refreshed_pes`（非 nil 计数）；DEL dashboard:summary；200 返回四计数。路由：protected 组 `POST /invest/refresh`（与 /invest 既有路由同组，静态段无冲突，起服实测）
- [ ] **Step 3: 前端**：types.ts RefreshResult；api.ts refreshInvest（POST，无 body）；InvestPage 持仓表卡片 header 动作槽（筛选 Tabs 同行右侧）加 RefreshCw 图标按钮：`title/aria-label=t("invest.refresh")`，mutation pending 时 `animate-spin` + disabled；onSuccess → toast `invest.refreshDone`（插值计数，如「已刷新 {n} 项行情、{m} 项 PE」/en/es 同构）+ invalidate ["positions"]["assets"]["dashboard"]；onError → e:unknown+instanceof ApiError toast（errorText 惯例）
- [ ] **Step 4: i18n**：`invest.refresh`（按钮 title）、`invest.refreshDone`（含 {{quotes}}/{{pes}} 插值）三语齐；zh 既有键零变化；`node frontend/scripts/check-i18n.mjs` PASS
- [ ] **Step 5: 后端单测**：service_test.go 加 force 语义可测部分——无 redis 环境下 QuotesForce 与 Quotes 行为一致性（provider 被调、结果正确）；**force 跳缓存的实证走 Step 6 集成验证**（测试基建无 redis 假件，不为此引新依赖——控制器裁决）
- [ ] **Step 6: 验证**：backend build/vet/test 全绿；PORT=8090 起独立后端（复用 /tmp 或 go build 临时二进制，测后精确 kill）：① `GET /api/quotes?symbols=<真实持有符号>` 预热缓存 → 立即 `POST /api/invest/refresh` → 后端日志出现上游请求（证明绕过缓存）→ 响应四计数合理（refreshed_quotes>0，PE 子集排除基金/黄金）② refresh 后 60s 内再 GET quotes 无新上游日志（force 结果已写缓存）③ 无资产空表时 refresh → 200 全零计数；前端 tsc×2+build 零错误；vite 3001（proxy→8080 或临时 config→8090）Playwright：按钮可见、点击旋转→toast 出现→持仓表价格列刷新（对比点击前后 API 值）、en 态按钮 title 抽查；**冒烟** `BASE_URL=http://localhost:3001 node frontend/scripts/smoke.mjs` 11 步全 PASS；**8080 生产进程处置**：本迭代改了后端——收尾时以本分支二进制替换 8080（ps 复核 PID 2154 命令行后 kill、起新二进制 nohup 留驻、curl /api/positions 验证），前端 3000 vite 热更自动生效
- [ ] **Step 7: Commit**（前后端分两 commit）：`feat(backend): force-refresh endpoint bypassing quote and PE caches`、`feat(frontend): refresh button for positions quotes and PE`

---

## Self-Review 记录

- **需求覆盖**：强制刷新现价（QuotesForce+端点+按钮）✓；「还有PE这些信息」（PEsForce 同端点聚合，一次点击行情+PE 全刷）✓。
- **占位符扫描**：端点契约四字段逐字、force 语义边界（跳读不跳写）、符号谓词复用点（snapshot.go:103 / invest.go:115-121）均给出具体位置；无 TBD。
- **类型一致性**：RefreshResult 四字段 = HTTP JSON = handler 返回，单任务内闭环。
- **风险**：force 并发点击连打上游——单用户 + 按钮 pending 禁用已足够，不做服务端限流（YAGNI，报告注明）；PEsForce 跳过防穿透 null 缓存意味着失败符号每次点击都重试上游——用户主动行为，可接受。
