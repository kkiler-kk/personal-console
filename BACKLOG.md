# 交付后 Backlog（按优先级）

## 置顶：安全裁决（2026-09-13 迭代三新增）

0. **公网部署前恢复认证** —— 2026-09-13 用户决定移除登录（`SingleUserMiddleware` 单用户直通），后端监听所有网卡且无认证：同网段设备可读写全部数据（含持仓/交易流水等财务数据）。`middleware/auth.go` git 历史有完整 JWT 版本，`pkg/jwt.go` 保留为基座；裁决清单见 spec §8（`docs/superpowers/specs/2026-09-12-personal-site-redesign-design.md`）。恢复认证后须先改 felix 种子用户密码（占位 bcrypt hash，不可登录）。在此之前仅本地/可信 LAN 使用，不做端口映射/内网穿透/公网反代。

## 首次迭代优先

1. 照片墙删除按钮加 AlertDialog 确认 + `group-focus-within:opacity-100`（frontend/src/pages/life/GalleryLightbox.tsx:110，误触即删 + 键盘不可见）
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
18. formatDuration 输出格式与 LearnPage 大数字拆分的隐式契约（建议改返回 {value,unit} 或加 splitDuration helper）；NaN 守卫可选（learn 时长显示迭代审查移交）

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
