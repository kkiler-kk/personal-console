# 交付后 Backlog（按优先级）

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
