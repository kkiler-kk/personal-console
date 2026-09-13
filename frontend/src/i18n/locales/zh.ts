// 中文（zh）界面文案。命名空间分节：common/nav/topbar/dashboard/errors。
// 键集合须与 en.ts / es.ts 完全一致（scripts/check-i18n.mjs 自检）。
// 插值用 i18next 双花括号语法 {{var}}；escapeValue 关闭（React 已转义）。
const zh = {
  common: {
    search: "搜索",
    retry: "重试",
    searchPlaceholder: "搜索或跳转…",
    searching: "搜索中…",
    noResults: "无匹配结果",
    groupNav: "导航",
    groupPosts: "文章",
    groupAssets: "资产",
    groupHabits: "习惯",
    groupCategories: "分类",
    groupTags: "标签",
  },
  nav: {
    brand: "Felix 控制台",
    overview: "总览",
    invest: "投资",
    learn: "学习",
    life: "生活",
    blog: "博客",
    blogArchive: "博客归档",
  },
  topbar: {
    toggleTheme: "切换主题",
    userMenu: "用户菜单",
    admin: "管理后台",
    language: "语言",
  },
  dashboard: {
    greeting: "你好，{{name}}",
    subtitle: "这是你的个人控制台总览",
    portfolio: "投资组合",
    addAsset: "去添加资产",
    showNumbers: "显示金额数字",
    hideNumbers: "隐藏金额数字",
    pnlWithPct: "{{amount}}（{{pct}}）",
    todayStudy: "今日学习",
    streakDays: "连续 {{n}} 天",
    noStudyToday: "今天还没学习",
    habitCheckin: "习惯打卡",
    createHabit: "去创建习惯",
    noCheckinToday: "今天还没打卡",
    checkedInToday: "今日已打卡",
    publishedPosts: "已发布文章",
    comments: "评论",
    photos: "照片",
    valueCurve: "收益曲线（近 30 天 · CNY）",
    numbersHidden: "数字已隐藏",
    curveEmpty: "录入交易并积累每日快照后生成曲线",
    habitHeat: "习惯热力",
    heatEmpty: "创建习惯并打卡后生成热力图",
  },
  errors: {
    loadFailed: "加载失败",
    notFound: "页面不存在",
    searchFailed: "搜索失败",
  },
}

export default zh
