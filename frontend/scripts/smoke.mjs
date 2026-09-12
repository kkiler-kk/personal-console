// 阶段冒烟测试：真实浏览器跑通「未登录跳转 → 登录 → Dashboard → 博客 → 管理后台 → 生活页」六步链路。
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

// 6. 生活页可达
await page.goto(BASE + "/life", { waitUntil: "networkidle" })
await page.waitForSelector("text=生活", { timeout: 10_000 })

if (errors.length) throw new Error("页面 JS 错误:\n" + errors.join("\n"))
console.log("SMOKE PASS ✅")
await browser.close()
