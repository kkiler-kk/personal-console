# 交付后 Backlog（按优先级）

## 置顶：安全裁决（2026-09-13 迭代三新增）

0. **公网部署前恢复认证** —— 2026-09-13 用户决定移除登录（`SingleUserMiddleware` 单用户直通），后端监听所有网卡且无认证：同网段设备可读写全部数据（含持仓/交易流水等财务数据）。`middleware/auth.go` git 历史有完整 JWT 版本，`pkg/jwt.go` 保留为基座；裁决清单见 spec §8（`docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md`）。恢复认证后须先改 felix 种子用户密码（占位 bcrypt hash，不可登录）。在此之前仅本地/可信 LAN 使用，不做端口映射/内网穿透/公网反代。

## 首次迭代优先

1. ~~照片墙删除按钮加 AlertDialog 确认 + `group-focus-within:opacity-100`~~ —— **已关闭（迭代五 Task 1，81c833f）**：删除按钮移入悬停浮层 + AlertDialog 确认 + `group-focus-within:opacity-100` 键盘可达全部落地
2. generateSlug 同秒冲突加固：纯中文标题同秒两条会撞 UNIQUE → 500，冲突时追加随机后缀（backend/handler/post.go:406 附近）
3. ErrorState 显示条件收紧为 `isError && !data`（PostList/Archive/CommentSection/InvestPage，避免后台 refetch 失败遮蔽已有数据）

## 次优先

4. smoke.mjs：heatmap GET 补 ok() 检查（报错可读性）；第 8 步 traded_at 改本地日期构造（与 9/10 步口径统一，UTC 残留）
5. dashboard Summary：DB 瞬断（非 ctx 取消）时零值仍缓存 60s——任一子查询失败跳过 SET（backend/handler/dashboard.go）
6. 习惯归档的取消归档 UI（?all=1 后端已备）
7. check/uncheck 逐行 isPending（现为全局共享禁用）
8. habits check/uncheck 的 date 允许未来（与 learn 口径不一致；补打卡合法，未来日期仅影响热力图）——拒绝或文档化二选一
9. HabitHeatmap React.memo + 切年 keepPreviousData；12 月标签右缘裁切
10. habit Delete 两步包事务
11. learn.go IFNULL(updated_at, CURRENT_TIMESTAMP) 兜底值时区收敛（updated_at 前端未展示，低优先）
12. smoke/v7ErrorText 文案打磨（"已按原样提交"类措辞、空 Code 输出 ": desc"）
13. 二级行情源评估（Stooq 被反爬封锁，Yahoo 失效时仅剩 last-known 兜底；候选 finnhub 免费层）——评估结论写回 spec §4.1

---

来源 = 阶段 1-4 SDD 账本延后项与终审 triage（2026-09-13）。

## 隐私开关/A股ETF 迭代遗留（2026-09-13 联合审查）
14. 流水表「备注」列自由文本不遮蔽（用户可能写金额；无法可靠识别数字，现状留档）
15. 遮蔽态下「已清仓」badge 仍显示（间接泄露数量=0；如需严格可 masked 时隐藏）
16. lib/mask.ts mount 时无条件回写 localStorage（首访创建 invest-mask="0" 键，纯卫生）
17. AssetDialog manual 预设切换不重置 type（显示与提交一致，无实害）
18. ~~formatDuration 输出格式与 LearnPage 大数字拆分的隐式契约（建议改返回 {value,unit} 或加 splitDuration helper）；NaN 守卫可选（learn 时长显示迭代审查移交）~~ —— **已关闭（迭代四 i18n Task 3 落地）**：签名改为 `formatDuration(minutes, t)`，单位词走 `common.minutes/hours` 复数键，输出恒为「数值␣单位」两段式（LearnPage 按空格拆大小字，三语同构，契约已写入 duration.ts 文档注释）

## 阶段 2.6 终审移交（2026-09-13）

19. CNY 折算消费实际报价币种（q.Currency）而非仅资产币种，或加不变量「FundCN 供价资产 currency 必为 CNY」并在路由/写回校验——根治 symbol 形态路由 vs price_source 强制币种的结构性错配
20. "us"/"ashare" 预设补裸 6 位码轻校验 toast（提示将按中国基金净值源计价），堵 UI 误建路径
21. 用前导零基金（如 000001）跑一次真链验证 FCODE 回显与分页历史
22. PE 排除可按 symbol 形态扩展（既有裸 6 位 yahoo 资产少打一次无效 v7）
23. Radix Tabs → ToggleGroup a11y 语义（筛选器场景）

## 迭代三遗留（2026-09-13 无认证/币种切换/拖拽排序，minor 延后）

24. 持仓拖拽把手键盘重排不可达（T6 已补 `aria-label="拖拽排序把手"`；HTML5 原生 DnD 仅鼠标可拖，列排序为部分替代——桌面特性定位，如补键盘重排需换 Pointer Events/自定义方案）
25. displayCurrency 的 fx 回落判定在 InvestPage/Dashboard 双份，可提取共享 `resolveDisplayCurrency`（附带：toggle 未 useCallback，零实际影响）
26. fx 的 `?? 1` 兜底使「汇率缺失」与「1:1」不可分辨（positions summary 契约下不可达，卫生项）
27. search.go:27 「防 sql_mode 漂移」注释措辞过强（sql_mode 漂移下 ESCAPE 同样失效，只是显式报错而非静默错义）
28. asset.go Reorder 注释（~:257）防线分工失准——「数量比对」并不能拦截等长重复 ids，`seen` 集合才是重复的拦截者；router.go:112 注释两处小疵（gin≥1.5 静态段天然优先于参数段、注册先后无关；「见 task-3 报告」指针会悬空，应改为自含结论）
29. model.go `Comment.CanDelete` 行 gofmt 对齐（HEAD 起既有问题，历次任务未越权修，留档可另起 chore）

## 终审微修波移交（2026-09-13）

30. a11y：持仓拖拽键盘不可达（并 24 扩充）——把手 span 无 role/可操作语义（T6 的 `aria-label` 只补了命名），列排序为部分替代；且文档（README/spec）未注明该键盘限制，需在文档补一句或补 role="button" + 键盘重排方案
31. gofmt 一次性 pass（并 29）——`gofmt -l backend` 现报 `model/model.go`（CanDelete 对齐）与 `handler/post.go` 两文件；纯格式零行为，另起独立 chore 提交，勿混入功能波
32. `resolveDisplayCurrency` 提取共享（并 25 设触发条件）——现 InvestPage/Dashboard 双份 fx 回落判定不动，**第三消费点出现时**再提取，避免过早抽象
33. smoke 币种切换断言（可选）——UI 拨 CNY↔USD 开关后断言汇总卡前缀/换算数值（当前 step 8 只覆盖 API 层；reorder 回归门已于终审波入 step 8）

## 迭代四遗留（2026-09-14 i18n 三语收尾）

34. **后端错误消息 i18n（错误码方案）**——后端 handler 返回中文错误字符串，前端 `lib/api.ts` 对 `data.error` 原样透传不译（仅本地兜底壳 `errors.network/requestFailed` 走 i18n）；根治方案：后端改返回稳定错误码 + 参数，前端按码映射 `errors.*` 键（或 i18next 直接以码为键）——涉及全部 handler 错误路径与前端 13 处 errorText 消费点，宜独立迭代
35. **i18next TS augmentation（键编译期校验）**——Task 5 评估结论：NAV_ITEMS `labelKey` 窄联合不做（7 个静态定义零错字，边际收益趋零）；全站 `t()` 键编译期校验需 `i18next.d.ts` CustomTypeOptions 增强，但与既有动态键模式（`labelKey` 变量、`` `invest.preset.${v}.label` `` 模板拼接）冲突、需逐点显式断言，属迭代级改动，需要时另起

## 迭代五遗留（2026-09-14 照片墙现代化，minor 延后）

36. 照片墙触屏 + 键盘 a11y（frontend/src/pages/life/GalleryLightbox.tsx）——①触屏：无 hover 设备上浮层 `opacity-0` 但删除按钮 `pointer-events-auto`，点缩略图右上角会弹出"看不见的按钮"触发的确认框（AlertDialog 已兜底无数据风险；适配可 `@media (hover: none)` 常显信息条或改长按菜单）；②文件名 span `pointer-events-auto` 触屏死区：点击既不开灯箱也无 tooltip，触屏适配一并处理；③键盘：灯箱放大不可键盘触发（img onClick 无 tabIndex/role——删除钮已 focus-within 可达，打开动作缺失；如做可改 button 包裹或 role="button"+tabIndex+Enter）

## 迭代六遗留（2026-09-15 持仓强制刷新，minor 延后）

37. refresh 整体超时/并发上限——单上游请求 10s × 3 provider × N 资产无整体 deadline（现网 10 资产实测 1.7s）；pending 禁用仅单标签页生效，多标签可同时打上游。如做：ctx WithTimeout + 服务端单飞（singleflight）或最小间隔
38. force 不穿透积存金输入与汇率——goldResolver 内部 `Quotes(GC=F, CNY=X)` 与汇总 `USDCNY`（1h 缓存）在强制刷新时仍吃缓存，积存金克价时效最多滞后 60s/汇率 1h。如做：ResolveGold 加 force 形参或独立 force 路径
39. 「自动跟踪」两种表述收敛——SQL `service.AutoTrackedWhere`（snapshot/refresh）vs Go `!= "manual"`（invest.go positions 组装）；当前 price_source 白名单下等价，新增枚举值会静默分叉（positions 送刷、refresh 不送）。收敛为单一来源；顺带评估 `AutoTrackedWhere` 挪出 service 包（handler→service 依赖方向，现无环）
40. 存量资产 513650/513300 配置核对——以 `price_source=yahoo` + 裸 6 位码入库：Yahoo 前置拒绝，实际由链尾 FundCN（场外净值）定价、PE 恒 null（用户已知悉，此前沟通结论：想要场内实时市价需重建为 `.SS` 后缀资产）。如长期持有场内份额，建议改建；refresh 会把 FundCN 净值写回 current_price 属该配置的正常语义
