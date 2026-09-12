// 阶段冒烟测试：真实浏览器跑通「未登录跳转 → 登录 → Dashboard → 博客 → 管理后台 → 生活页 → 评论发删」七步链路。
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

if (errors.length) throw new Error("页面 JS 错误:\n" + errors.join("\n"))
console.log("SMOKE PASS ✅")
await browser.close()
