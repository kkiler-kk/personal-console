# 迭代七：资产占比分组聚合 + 悬停明细统计 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 投资页「资产占比」卡把同一底层指数的资产合并为一组（首批规则：纳斯达克系——QQQM/016532/513300），组行悬停显示组内各资产明细：各自占总资产比例、组内占比、交易次数与首末交易日期；持仓表不动、后端零改动。

**Architecture:** 纯前端。InvestPage 的 allocation 计算从「每资产一行」升级为「分组聚合」：常量规则表 `ALLOCATION_GROUPS`（匹配函数基于 name 关键词/symbol 前缀，未命中资产保持独立组）；交易统计从既有 trades 查询数据 client 侧聚合（`Map<asset_id, {count, first, last}>`）；每行包悬停浮层（HoverCard 优先——`npx shadcn@latest add hovercard` 从零新 npm 依赖的 radix-ui 统一包生成；若生成失败退回既有 Tooltip 富内容）。浮层只显示比例/次数/日期，**不显示金额**（遮蔽态语义安全）。

**Tech Stack:** 同前（前端零新 npm 依赖；hovercard 为 shadcn 组件文件生成，radix-ui 包已在）。

**Spec:** 交付后迭代（用户 2026-09-15：「跟纳斯达克占比的都是一个资产 鼠标悬浮的时候显示各个纳斯达克的区别占比比例 还有交易时间次数都可以做个统计」+「持仓里面就不需要改」）

## Global Constraints

- **持仓表零改动**（用户明示）；后端零改动；占比卡以外的汇总卡/曲线/流水不动
- 零新 npm 依赖（shadcn 组件生成除外——`package.json` dependencies 不得新增条目；生成后 `git diff package.json` 必须为空或仅 lockfile 无实质变化，报告注明）
- 分组规则表可扩展但首批**只有纳斯达克一条**：name 含「纳斯达克」或 "nasdaq"（小写比较）或 symbol 含 "QQQ" → 组 `nasdaq`；黄金不合并（积存金=金价、021958=金股指数，底层不同——用户未要求，报告注明扩展方式即可）
- 遮蔽态（masked）下浮层可打开但**零金额**：只显示 pct/count/日期（现占比条本就只显 %，语义延续）
- trades 数据源：确认既有流水查询拉取量（后端上限 200，渲染截 50）——统计必须基于**拉取的全量**而非渲染切片；若现查询本身只拉 50 条则改为拉全量渲染侧 slice（不动后端）
- i18n 三语纪律：新键 `invest.alloc.*`，zh 既有键零变化，check-i18n PASS；smoke 11 步零破坏（占比卡不在断言路径）
- 惯例全沿用（TS strict/e:unknown/tnum/显式 add/PID/8080 PID 12464 与 3000 用户 vite 永不触碰——本迭代纯前端，验证 vite 3001 proxy 默认 8080 只读即可，**不要点击刷新按钮以外的写操作、不建测试资产**：占比与统计用真实持仓数据断言形状即可）
- conventional commits

## 文件结构

```
frontend/src/
├── pages/invest/InvestPage.tsx        分组聚合 + 统计 + 浮层（Task 1）
├── components/ui/hover-card.tsx       shadcn 生成（若走 HoverCard 方案）（Task 1）
├── i18n/locales/{zh,en,es}.ts         invest.alloc.* 增量键（Task 1）
```

---

### Task 1: 占比分组 + 悬停统计（单任务迭代）

**Files:** Modify `frontend/src/pages/invest/InvestPage.tsx`、`frontend/src/i18n/locales/{zh,en,es}.ts`；Create（若采用）`frontend/src/components/ui/hover-card.tsx`

**Interfaces:**
- Consumes: 既有 positions/trades 查询（["positions"]/["trades"]）、useInvestMask、useDisplayCurrency、useTranslation
- Produces: `ALLOCATION_GROUPS` 常量（InvestPage 内或 lib/，报告注明位置）；分组后 allocation 结构 `{key,label,valueCny,pct,members:[{name,symbol,valueCny,pctOfTotal,pctOfGroup,tradeCount,firstTrade,lastTrade}]}`；i18n `invest.alloc.*` 键

- [ ] **Step 1: 分组聚合**：allocation 计算（InvestPage.tsx:208 附近）改为两段——先按现逻辑算每资产 valueCny，再经 `ALLOCATION_GROUPS` 规则归组（未命中→以 symbol 为 key 的独立组，label=资产名）；组 pct=成员和；组排序按 valueCny 降序（现语义保持）；组行显示 `label + 组 symbol 列表或成员数`（单资产组显示与现状一致：name+symbol）
- [ ] **Step 2: 交易统计**：读 trades 查询数据确认拉取量（见 Global Constraints）；useMemo 聚合 `Map<asset_id,{count,first,last}>`（traded_at 字符串直接字典序比较即可，yyyy-MM-dd）；成员行挂统计，无交易资产 count=0/日期显示「—」
- [ ] **Step 3: 悬停浮层**：`npx shadcn@latest add hovercard` 尝试生成（radix-nova 变体；生成后 grep 导出名再消费；失败则退回 ui/tooltip.tsx 富内容方案，报告注明选择）；每占比行包 HoverCard（trigger 整行，hover 打开）：内容=成员列表，每成员两行——`name symbol`+`占总资产 X% · 组内 Y%`（单资产组省略组内）+`N 笔交易 · first ~ last`（tnum）；组行加视觉提示（如虚线下划线或 Info 图标 hint，cursor-default）；键盘可达性：trigger 加 tabIndex=0（HoverCard radix 自带 focus 触发则免）
- [ ] **Step 4: i18n**：新键（按实际文案定，示例）`invest.alloc.groupOf`（「{{name}} 组」如需要）、`invest.alloc.ofTotal`（占总资产）、`invest.alloc.ofGroup`（组内）、`invest.alloc.tradeCount`（{{count}} 笔交易，复数用 _one/_other 如 en/es 需要）、`invest.alloc.noTrades`——三语齐；zh 既有键零变化；check-i18n PASS
- [ ] **Step 5: 验证**：tsc×2+build 零错误；`git diff frontend/package.json` 零新增依赖；Playwright（vite 3001→8080 只读）：占比卡渲染——纳斯达克组合并行（pct≈三成员和 34.8+4.8+0.x）、hover 组行浮层出现、含三成员各自 pct/交易次数/日期、单资产组（如 GOLD_CNY_G）浮层含统计、masked 态浮层零金额（grep 浮层内容无 ¥/$ 数字）；en 态抽查新键；冒烟 `BASE_URL=http://localhost:3001 node frontend/scripts/smoke.mjs` 11 步全 PASS；清理自起进程
- [ ] **Step 6: Commit**：`feat(frontend): grouped allocation with hover breakdown and trade stats`

---

## Self-Review 记录

- **需求覆盖**：纳斯达克识别合并（规则表）✓；悬浮显示各成员区别占比（组内+占总双比例）✓；交易时间次数统计（count+first~last）✓；持仓表不动 ✓。
- **占位符扫描**：规则谓词、聚合结构、浮层内容、统计口径均给具体形态；无 TBD。
- **类型一致性**：allocation 新结构单任务内定义即消费。
- **风险**：trades 上限 200——单用户远低于，若超统计截断（报告注明）；hover 在触屏不可用（桌面定位，同拖拽排序先例，BACKLOG 不另记——#36 已覆盖照片墙触屏类议题）。
