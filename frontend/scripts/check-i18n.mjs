// i18n 三语键完整性自检：加载 zh/en/es locale，扁平化键路径，互 diff 须为空。
// 复用方式（后续任务同此命令）：node frontend/scripts/check-i18n.mjs
// Node ≥23.6 默认剥离 TS 类型，可直接 import .ts；如报语法错可加 --experimental-strip-types。
import zh from "../src/i18n/locales/zh.ts"
import en from "../src/i18n/locales/en.ts"
import es from "../src/i18n/locales/es.ts"

/** 递归扁平化为「a.b.c」键路径集合（仅叶子计入，命名空间节点不计） */
function flatten(obj, prefix = "", out = new Set()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out)
    else out.add(key)
  }
  return out
}

const locales = { zh: flatten(zh), en: flatten(en), es: flatten(es) }
const names = Object.keys(locales)
let ok = true

for (const a of names) {
  for (const b of names) {
    if (a === b) continue
    const missing = [...locales[a]].filter((k) => !locales[b].has(k))
    if (missing.length) {
      ok = false
      console.error(`✗ ${b} 缺少 ${a} 的键 (${missing.length}):`, missing.join(", "))
    }
  }
}

if (!ok) {
  console.error("\nKEY CHECK FAIL ❌")
  process.exit(1)
}
console.log(`KEY CHECK PASS ✅  (${locales.zh.size} keys × ${names.length} locales: ${names.join("/")})`)
