# 迭代五：照片墙现代化（横竖屏 masonry + 灯箱增强）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生活板块照片墙从"方形裁切网格"升级为**保留原始宽高比的瀑布流**（横屏/竖屏照片各得其所），悬停浮层信息条 + 加载渐显 + 灯箱体验增强；不引新依赖，纯 CSS/React。

**Architecture:** GalleryLightbox.tsx 网格区重构为 CSS multi-column masonry（`columns-2 sm:columns-3 lg:columns-4` + `break-inside-avoid`），img 从 `aspect-square object-cover`（裁切）改为 `w-full h-auto object-cover`（保比例）；每项悬停浮层（scale + 渐变信息条：日期/尺寸）；图片 onLoad 渐显（skeleton 底色 + opacity 过渡）；灯箱保持既有循环切换/键盘/计数，补图片加载态。三语键同步（life.gallery.* 增量）。

**Tech Stack:** 同前（无新依赖）。

**Spec:** 交付后迭代（用户 2026-09-14：横竖屏展现方式 + 渲染现代化）

## Global Constraints

- 不引新依赖（CSS columns 方案，非 Masonry 库）；后端零改动
- 既有能力零回归：上传（admin 语义现为单用户恒显）/删除（悬停按钮+确认）/灯箱（循环/Esc/←→/计数）
- 新文案全部走 i18n 三语键（life.gallery.* 增量，check-i18n 自检 PASS）；**zh 既有键值不动**（冒烟 step 6 h1「生活」及 life 相关选择器零破坏——改前读 smoke.mjs 核对）
- 图片元数据现状：gallery API 仅 filename/url/size/mod_time——信息条用 mod_time（yyyy-MM-dd）+ size（KB/MB 格式化，新 helper 或内联）；**不新增后端字段**（EXIF/宽高属 BACKLOG 级扩展）
- 惯例全沿用（strict/tnum/e:unknown/toast/invalidate/PID/显式 add/8080 与 3000 勿动）
- conventional commits

## 文件结构

```
frontend/src/
├── pages/life/GalleryLightbox.tsx     网格重构 + 悬停浮层 + 渐显 + 灯箱加载态（Task 1）
├── i18n/locales/{zh,en,es}.ts         life.gallery.* 增量键（Task 1）
├── scripts/smoke.mjs                  不改（zh 键值零变化则无需动；若新增断言可选）
README.md                              照片墙描述一句更新（Task 1）
```

---

### Task 1: 照片墙现代化（单任务迭代）

**Files:** Modify `frontend/src/pages/life/GalleryLightbox.tsx`、`frontend/src/i18n/locales/{zh,en,es}.ts`、`README.md`

**Interfaces:**
- Consumes: 既有 getGallery/uploadImage/deleteGalleryFile、useQuery ["gallery"]、灯箱 state 结构
- Produces: masonry 网格 + `formatFileSize(bytes)`（可放 lib/format.ts——若放则计入 Files）+ life.gallery 增量键（如 uploadHint/loadedAt 等按实际需要，zh/en/es 三份齐）

- [ ] **Step 1: 网格重构**：容器 `columns-2 sm:columns-3 lg:columns-4 gap-3`；每项 `break-inside-avoid mb-3 group relative rounded-xl overflow-hidden border border-border`；img `w-full h-auto object-cover`（**删除 aspect-square**）+ `loading="lazy"` + onLoad 渐显（初始 `opacity-0` → loaded `opacity-100 transition-opacity duration-300`，底层 skeleton bg-muted animate-pulse 占位——用 per-item loaded state（Set<filename> 或 img onLoad 回调置 state）实现）
- [ ] **Step 2: 悬停浮层**：`absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity`；底部信息条：日期（mod_time slice(0,10)）+ 大小（formatFileSize）+ filename（truncate，title 全名）；删除按钮移入浮层右上（保持既有确认流程与 aria-label——现有删除无确认框，**顺手加 AlertDialog**（BACKLOG #14 遗留：照片删除误触即删））；键盘可达性：浮层按钮 focus-within 也显示（`group-focus-within:opacity-100`）
- [ ] **Step 3: 灯箱增强**：大图加载态（onLoad 前 spinner/骨架）；既有 object-contain max-h-[80vh]/循环/Esc/←→/计数/aria 保持；标题栏补日期+大小（信息密度）
- [ ] **Step 4: i18n**：新增用户可见文案（如删除确认框文案「删除这张照片？此操作不可恢复」/Delete this photo?…/¿Eliminar esta foto?…、加载失败类）全部三语键；**既有 zh 键值逐字不动**；`node frontend/scripts/check-i18n.mjs` PASS
- [ ] **Step 5: README** 照片墙描述更新（瀑布流/悬停信息/灯箱）
- [ ] **Step 6: 验证**：tsc×2+build 零错误；Playwright（3001→8080，勿动两进程）：上传 2 张不同比例测试图（可用脚本生成 400×800 竖图与 800×400 横图 PNG）→ 断言两图渲染高度不同（保比例，非方形裁切）→ 悬停浮层出现（hover 后信息条可见、删除按钮可点）→ 删除确认框流程 → 灯箱打开/切换/关闭 → en 态抽查 2 处新键 → **冒烟 11 步全 PASS**（zh 零破坏）→ 测试图删净（uploads 目录与 API 双确认）
- [ ] **Step 7: Commit** `feat(frontend): modern masonry photo wall with hover overlay and lightbox polish`

### Task 2: 迭代四终审移交项（微修批）

**Files:** Modify `frontend/src/i18n/locales/{zh,en}.ts`（stale 模板润色，es 若同源一并对齐）、`frontend/scripts/smoke.mjs`（step11 追加断言）、`frontend/scripts/check-i18n.mjs` 不动（仅挂 pre-commit）、可选 `.git/hooks/pre-commit` 或 package.json script

**Interfaces:**
- Consumes: 迭代四既有键 `invest.staleHint`（以 locales 实际键名为准——改前 grep "stale\|原样\|as-is" 定位）与 smoke step11 结构（默认 en 独立 context）
- Produces: 润色后三语一致文案 + step11 增断言（en 态归档页 yearMonthTitle 格式，如 "September 2026" 样式——以 Archive 组件实际渲染断言，不猜格式：先读 en.ts 对应模板键）

- [ ] **Step 1: stale 模板润色**：zh/en 两处"已按原样提交/数据陈旧"类措辞按终审建议打磨（读现值→更自然的表达→es 同步）；纯文案改动，键名不动
- [ ] **Step 2: smoke step11 追加**：默认 en context 下访问 /blog（或 Archive 路由）断言年月标题为英文格式（选择器用 step11 既有 text= 风格）；zh 10 步零改动
- [ ] **Step 3: pre-commit 挂 check-i18n**（可选，做了报告注明）：`.git/hooks/pre-commit` 追加 `node frontend/scripts/check-i18n.mjs || exit 1`（hook 不入库——本机便利，README 不提）
- [ ] **Step 4: 验证**：`node frontend/scripts/check-i18n.mjs` PASS；冒烟 11 步全 PASS（zh 钉死 + 新 step11 断言）；tsc/build 零错误
- [ ] **Step 5: Commit** `chore(frontend): polish stale copy and extend smoke i18n assertion`

---

## Self-Review 记录

- **需求覆盖**：横竖屏（masonry 保比例）✓；现代化渲染（渐显/浮层/灯箱加载态）✓；顺手关闭 BACKLOG #14（照片删除确认）✓。
- **占位符扫描**：类名/结构/文案键给出具体形态；无 TBD。
- **风险**：CSS columns 的项序为列优先（视觉顺序≠DOM 顺序）——照片墙可接受（非时间线语义），报告注明即可；若用户在意时序可改 grid-auto-rows 方案（BACKLOG 备查）。img 高度未知时 columns 布局的重排抖动——skeleton 占位缓解，接受。
- **冒烟**：zh 键值不动 + 无新 zh 文案依赖 → 11 步零影响；验证含全量冒烟兜底。Task 2 移交项均微修级，独立任务便于审查隔离。
