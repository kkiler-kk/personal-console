// 阶段冒烟测试：真实浏览器跑通「直达 Dashboard → 博客 → 管理后台 → 全站搜索 → 生活页 → 评论发删 → 投资链路 → 学习链路 → 习惯链路」十步链路。
// 单用户本地部署（无登录）：无需任何凭据环境变量。
// 用法：node frontend/scripts/smoke.mjs
// 可选：BASE_URL 覆盖前端地址（默认 http://localhost:3000）
import { chromium } from "playwright"

const BASE = process.env.BASE_URL || "http://localhost:3000"

const browser = await chromium.launch()
// 钉死中文：context.addInitScript 在每个页面脚本前写入 ui-lang=zh，
// 使既有 10 步的中文选择器零改动（i18n 默认英文，见第 11 步断言）。
const context = await browser.newContext()
await context.addInitScript(() => localStorage.setItem("ui-lang", "zh"))
const page = await context.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))

// 1. 访问 / 直达 Dashboard（不跳登录），渲染统计卡
await page.goto(BASE + "/", { waitUntil: "networkidle" })
if (page.url().includes("/login")) throw new Error("意外跳转登录页: " + page.url())
await page.waitForSelector("text=已发布文章", { timeout: 10_000 })

// 2. 博客列表可达
await page.goto(BASE + "/blog", { waitUntil: "networkidle" })
await page.waitForSelector("h1", { timeout: 10_000 })

// 3. 管理后台可达
await page.goto(BASE + "/admin/posts", { waitUntil: "networkidle" })
await page.waitForSelector("text=文章管理", { timeout: 10_000 })

// 4. 管理总览可达（h1 精确断言，避免命中 AdminNav 的「总览」链接）
await page.goto(BASE + "/admin", { waitUntil: "networkidle" })
await page.waitForSelector('h1:has-text("管理总览")', { timeout: 10_000 })

// 5. 全站搜索：GET /api/search?q=smoke → 200 且五键恒为数组（只断形状，命中与否随数据）
const searchRes = await page.request.get(BASE + "/api/search?q=smoke")
if (!searchRes.ok()) throw new Error("STEP5: search 非 200: " + searchRes.status())
const searchJson = await searchRes.json()
for (const key of ["posts", "assets", "habits", "categories", "tags"]) {
  if (!Array.isArray(searchJson[key])) throw new Error(`STEP5: search.${key} 非数组: ` + JSON.stringify(searchJson))
}
console.log("STEP5 SEARCH PASS")

// 6. 生活页可达（用 h1 精确断言，避免命中侧边栏导航）
await page.goto(BASE + "/life", { waitUntil: "networkidle" })
await page.waitForSelector('h1:has-text("生活")', { timeout: 10_000 })

// 7. 评论发→删链路（若无已发布文章则跳过，不算失败）
await page.goto(BASE + "/blog", { waitUntil: "networkidle" })
// 文章卡片标题链接（PostCard: <a class="text-lg font-semibold ...">），避免命中侧边栏/归档按钮
const firstPostLink = page.locator('a.text-lg.font-semibold[href^="/blog/"]').first()
if (await firstPostLink.count() === 0) {
  console.log("STEP7 SKIPPED: no posts")
} else {
  await firstPostLink.click()
  await page.waitForSelector('h2:has-text("评论")', { timeout: 10_000 })
  const CONTENT = `smoke-comment-${Date.now()}`
  await page.fill('input[placeholder="昵称"]', "Smoke")
  await page.fill('input[placeholder^="邮箱"]', "smoke-test@example.com")
  await page.fill('textarea[placeholder="说点什么…"]', CONTENT)
  await page.locator('button:has-text("评论"):not(:has-text("发送中"))').first().click()
  const commentText = page.locator(`p:text-is("${CONTENT}")`).first()
  await commentText.waitFor({ timeout: 10_000 })
  // can_delete 依赖查询时的 email（localStorage.comment_email 提交成功后才写入），
  // 与真实用户二次访问一致：reload 后删除按钮才出现
  await page.waitForFunction(() => localStorage.getItem("comment_email") === "smoke-test@example.com", { timeout: 10_000 })
  await page.reload({ waitUntil: "networkidle" })
  await page.locator(`p:text-is("${CONTENT}")`).first().waitFor({ timeout: 10_000 })
  // 删除该评论（评论条目内含「删除」按钮）
  const item = page.locator("div.py-3", { hasText: CONTENT }).first()
  await item.locator('button:has-text("删除")').click()
  await page.waitForSelector(`p:text-is("${CONTENT}")`, { state: "detached", timeout: 10_000 })
}

// 8. 投资链路：建资产 → 改价 → 录交易 → 持仓推导校验 → /invest 页面断言 → 清理（后端无认证，直接请求）
// 创建也放进 try：资产一旦建成，后续任何失败 finally 都能保证清理
let assetId = null
let tradeId = null
try {
  const created = await page.request.post(BASE + "/api/assets", {
    data: { symbol: "SMOKETEST", name: "冒烟测试资产", type: "other", price_source: "manual", currency: "USD" },
  })
  if (!created.ok()) throw new Error("create asset failed: " + created.status())
  assetId = (await created.json()).id
  const pr = await page.request.put(BASE + `/api/assets/${assetId}/price`, { data: { price: 100 } })
  if (!pr.ok()) throw new Error("update price failed: " + pr.status())
  const tr = await page.request.post(BASE + "/api/trades", {
    data: { asset_id: assetId, side: "buy", quantity: 2, price: 90, fee: 0, traded_at: new Date().toISOString().slice(0, 10) },
  })
  if (!tr.ok()) throw new Error("create trade failed: " + tr.status())
  const trJson = await tr.json() // json() 只能消费一次，先存再用
  tradeId = trJson.id
  const pos = await (await page.request.get(BASE + "/api/positions")).json()
  const row = pos.positions.find((p) => p.asset.symbol === "SMOKETEST")
  if (!row || Math.abs(row.quantity - 2) > 1e-9 || Math.abs(row.avg_cost - 90) > 1e-9) {
    throw new Error("position mismatch: " + JSON.stringify(row))
  }
  // 形状断言：pe_ttm 键必须存在（manual 资产值为 null 属预期，键缺席才是回归）
  if (!("pe_ttm" in row)) throw new Error("position row missing pe_ttm key: " + JSON.stringify(row))
  // reorder 回归门：SMOKETEST 已在库，全量 ids 原序往返提交须 200（顺序不变，无副作用）；
  // 缺一个 id 的部分集合提交须 400（端点侧「ids 与全部资产一致」校验的守护断言）
  const allIds = ((await (await page.request.get(BASE + "/api/assets")).json()).assets).map((a) => a.id)
  const ro = await page.request.put(BASE + "/api/assets/reorder", { data: { ids: allIds } })
  if (!ro.ok()) throw new Error("reorder original order failed: " + ro.status())
  const roBad = await page.request.put(BASE + "/api/assets/reorder", { data: { ids: allIds.slice(1) } })
  if (roBad.status() !== 400) throw new Error("reorder missing id should be 400, got: " + roBad.status())
  await page.goto(BASE + "/invest", { waitUntil: "networkidle" })
  await page.waitForSelector("text=SMOKETEST", { timeout: 10_000 })
} finally {
  // 清理：删交易 → 删资产（断言失败也不留测试数据）
  if (tradeId != null) {
    const dt = await page.request.delete(BASE + `/api/trades/${tradeId}`)
    if (!dt.ok()) console.error(`WARN: cleanup trade ${tradeId} failed: ${dt.status()}`)
  }
  if (assetId != null) {
    const del = await page.request.delete(BASE + `/api/assets/${assetId}`)
    if (!del.ok()) console.error(`WARN: cleanup asset ${assetId} failed: ${del.status()}`)
  }
}
console.log("STEP8 INVEST PASS")

// 9. 学习链路：记录学习时长 → 统计校验 → /learn 页面断言 → 清理
const now = new Date()
// today 用本地日期构造，与后端 Go 本地日期同口径（toISOString 为 UTC，晚间与本地可能差一天）
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
const sess = await page.request.post(BASE + "/api/learn/sessions", {
  data: { lang: "en", activity: "vocab", minutes: 25, date: today },
})
if (!(sess.status() === 201 || sess.ok())) throw new Error("create learn session failed: " + sess.status())
const { id: sessionId } = await sess.json()
try {
  const st = await (await page.request.get(BASE + "/api/learn/stats")).json()
  // 断言用 >=：当天若已有用户真实学习记录，minutes/streak 只会更大，不误判
  if (!st.today.en || st.today.minutes < 25 || st.streak < 1) {
    throw new Error("learn stats mismatch: " + JSON.stringify(st))
  }
  await page.goto(BASE + "/learn", { waitUntil: "networkidle" })
  await page.waitForSelector("text=英语", { timeout: 10_000 })
} finally {
  // 清理只删冒烟自建的 session id，不动用户真实学习记录
  const del = await page.request.delete(BASE + `/api/learn/sessions/${sessionId}`)
  if (!del.ok()) console.error(`WARN: cleanup learn session ${sessionId} failed: ${del.status()}`)
}
console.log("STEP9 LEARN PASS")

// 10. 习惯链路：建习惯 → 打卡 → 热力图含今天 → /life 页面断言 → 清理
// check/uncheck 显式传 date=today（与第 9 步同一本地日期口径），断言与清理都确定性强
let habitId = null
let habitChecked = false
try {
  const created = await page.request.post(BASE + "/api/habits", {
    data: { name: "冒烟习惯" },
  })
  if (!(created.status() === 201 || created.ok())) throw new Error("create habit failed: " + created.status())
  habitId = (await created.json()).id
  const ck = await page.request.post(BASE + `/api/habits/${habitId}/check`, { data: { date: today } })
  if (!ck.ok()) throw new Error("check habit failed: " + ck.status())
  habitChecked = true
  const hm = await (await page.request.get(BASE + `/api/habits/heatmap?year=${now.getFullYear()}`)).json()
  const cell = hm.days.find((d) => d.date === today)
  // 断言真实：今天必须在热力图中且 count>=1（当天若有用户真实打卡只会更大）
  if (!cell || cell.count < 1) throw new Error("heatmap missing today: " + JSON.stringify(hm.days))
  // 页面断言用 h1 精确选择器（text=生活 会误中侧边栏导航，阶段 1 教训）
  await page.goto(BASE + "/life", { waitUntil: "networkidle" })
  await page.waitForSelector('h1:has-text("生活")', { timeout: 10_000 })
} finally {
  // 清理：撤销打卡 → 删习惯（删习惯会级联清 habit_logs，先撤销保证任一步失败也不留痕）
  if (habitId != null && habitChecked) {
    const uc = await page.request.delete(BASE + `/api/habits/${habitId}/check`, { data: { date: today } })
    if (!uc.ok()) console.error(`WARN: uncheck habit ${habitId} failed: ${uc.status()}`)
  }
  if (habitId != null) {
    const dh = await page.request.delete(BASE + `/api/habits/${habitId}`)
    if (!dh.ok()) console.error(`WARN: cleanup habit ${habitId} failed: ${dh.status()}`)
  }
}
console.log("STEP10 HABIT PASS")

// 11. i18n 默认语言断言：全新无预置 context（localStorage 为空）→ 默认英文侧边栏（text=Invest）
//     + en 态年月标题格式（blog.yearMonthTitle 模板 "{{year}}-{{monthPadded}}" → "2026-09"；迭代五追加）
const ctx2 = await browser.newContext()
const page2 = await ctx2.newPage()
// Task 5：page2 同样挂 pageerror，错误并入末尾 errors 终检（与主 page 同口径）
page2.on("pageerror", (e) => errors.push(e.message))
await page2.goto(BASE + "/", { waitUntil: "networkidle" })
await page2.waitForSelector("text=Invest", { timeout: 10_000 })
// 年月过滤标题由 URL 参数纯派生（不依赖当月有无文章），h1 精确文本断言 en 模板渲染格式；
// 若语言态错误回落 zh，标题会是「2026 年 9 月」而断言失败
const enY = now.getFullYear()
const enM = String(now.getMonth() + 1).padStart(2, "0")
await page2.goto(`${BASE}/blog?year=${enY}&month=${enM}`, { waitUntil: "networkidle" })
await page2.waitForSelector(`h1:text-is("${enY}-${enM}")`, { timeout: 10_000 })
console.log("STEP11 I18N PASS")
await ctx2.close()

if (errors.length) throw new Error("页面 JS 错误:\n" + errors.join("\n"))
console.log("SMOKE PASS ✅")
await browser.close()
