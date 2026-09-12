// 阶段冒烟测试：真实浏览器跑通「未登录跳转 → 登录 → Dashboard → 博客 → 管理后台 → 生活页 → 评论发删 → 投资链路 → 学习链路」九步链路。
// 用法：SMOKE_USER=<用户名> SMOKE_PASS=<密码> node frontend/scripts/smoke.mjs
// 可选：BASE_URL 覆盖前端地址（默认 http://localhost:3000）
import { chromium } from "playwright"

const BASE = process.env.BASE_URL || "http://localhost:3000"
const USER = process.env.SMOKE_USER
const PASS = process.env.SMOKE_PASS
if (!USER || !PASS) { console.error("需要 SMOKE_USER / SMOKE_PASS 环境变量"); process.exit(1) }

const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on("pageerror", (e) => errors.push(e.message))

// 1. 未登录访问 / 应跳转 /login
await page.goto(BASE + "/", { waitUntil: "networkidle" })
if (!page.url().includes("/login")) throw new Error("未跳转登录页: " + page.url())

// 2. 登录
await page.fill("#u", USER)
await page.fill("#p", PASS)
await page.click('button[type=submit]')
await page.waitForURL(BASE + "/", { timeout: 10_000 })

// 3. Dashboard 渲染统计卡
await page.waitForSelector("text=已发布文章", { timeout: 10_000 })

// 4. 博客列表可达
await page.goto(BASE + "/blog", { waitUntil: "networkidle" })
await page.waitForSelector("h1", { timeout: 10_000 })

// 5. 管理后台可达
await page.goto(BASE + "/admin/posts", { waitUntil: "networkidle" })
await page.waitForSelector("text=文章管理", { timeout: 10_000 })

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

// 8. 投资链路：建资产 → 改价 → 录交易 → 持仓推导校验 → /invest 页面断言 → 清理（token 从登录态 localStorage 取）
const token = await page.evaluate(() => localStorage.getItem("token"))
if (!token) throw new Error("STEP8: localStorage 无 token")
const auth = { Authorization: `Bearer ${token}` }
// 创建也放进 try（task 4.5）：资产一旦建成，后续任何失败 finally 都能保证清理
let assetId = null
let tradeId = null
try {
  const created = await page.request.post(BASE + "/api/assets", {
    headers: auth,
    data: { symbol: "SMOKETEST", name: "冒烟测试资产", type: "other", price_source: "manual", currency: "USD" },
  })
  if (!created.ok()) throw new Error("create asset failed: " + created.status())
  assetId = (await created.json()).id
  const pr = await page.request.put(BASE + `/api/assets/${assetId}/price`, { headers: auth, data: { price: 100 } })
  if (!pr.ok()) throw new Error("update price failed: " + pr.status())
  const tr = await page.request.post(BASE + "/api/trades", {
    headers: auth,
    data: { asset_id: assetId, side: "buy", quantity: 2, price: 90, fee: 0, traded_at: new Date().toISOString().slice(0, 10) },
  })
  if (!tr.ok()) throw new Error("create trade failed: " + tr.status())
  const trJson = await tr.json() // json() 只能消费一次，先存再用
  tradeId = trJson.id
  const pos = await (await page.request.get(BASE + "/api/positions", { headers: auth })).json()
  const row = pos.positions.find((p) => p.asset.symbol === "SMOKETEST")
  if (!row || Math.abs(row.quantity - 2) > 1e-9 || Math.abs(row.avg_cost - 90) > 1e-9) {
    throw new Error("position mismatch: " + JSON.stringify(row))
  }
  // 形状断言（task 4.5）：pe_ttm 键必须存在（manual 资产值为 null 属预期，键缺席才是回归）
  if (!("pe_ttm" in row)) throw new Error("position row missing pe_ttm key: " + JSON.stringify(row))
  await page.goto(BASE + "/invest", { waitUntil: "networkidle" })
  await page.waitForSelector("text=SMOKETEST", { timeout: 10_000 })
} finally {
  // 清理：删交易 → 删资产（断言失败也不留测试数据）
  if (tradeId != null) {
    const dt = await page.request.delete(BASE + `/api/trades/${tradeId}`, { headers: auth })
    if (!dt.ok()) console.error(`WARN: cleanup trade ${tradeId} failed: ${dt.status()}`)
  }
  if (assetId != null) {
    const del = await page.request.delete(BASE + `/api/assets/${assetId}`, { headers: auth })
    if (!del.ok()) console.error(`WARN: cleanup asset ${assetId} failed: ${del.status()}`)
  }
}
console.log("STEP8 INVEST PASS")

// 9. 学习链路：记录学习时长 → 统计校验 → /learn 页面断言 → 清理（复用第 8 步 auth 登录态）
const now = new Date()
// today 用本地日期构造，与后端 Go 本地日期同口径（toISOString 为 UTC，晚间与本地可能差一天）
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
const sess = await page.request.post(BASE + "/api/learn/sessions", {
  headers: auth,
  data: { lang: "en", activity: "vocab", minutes: 25, date: today },
})
if (!(sess.status() === 201 || sess.ok())) throw new Error("create learn session failed: " + sess.status())
const { id: sessionId } = await sess.json()
try {
  const st = await (await page.request.get(BASE + "/api/learn/stats", { headers: auth })).json()
  // 断言用 >=：当天若已有用户真实学习记录，minutes/streak 只会更大，不误判
  if (!st.today.en || st.today.minutes < 25 || st.streak < 1) {
    throw new Error("learn stats mismatch: " + JSON.stringify(st))
  }
  await page.goto(BASE + "/learn", { waitUntil: "networkidle" })
  await page.waitForSelector("text=英语", { timeout: 10_000 })
} finally {
  // 清理只删冒烟自建的 session id，不动用户真实学习记录
  const del = await page.request.delete(BASE + `/api/learn/sessions/${sessionId}`, { headers: auth })
  if (!del.ok()) console.error(`WARN: cleanup learn session ${sessionId} failed: ${del.status()}`)
}
console.log("STEP9 LEARN PASS")

if (errors.length) throw new Error("页面 JS 错误:\n" + errors.join("\n"))
console.log("SMOKE PASS ✅")
await browser.close()
