// English (en) UI strings — the default language. Namespaces: common/nav/topbar/dashboard/errors.
// Key set MUST match zh.ts / es.ts exactly (verified by scripts/check-i18n.mjs).
// Interpolation uses i18next double-brace syntax {{var}}; escapeValue off (React escapes).
const en = {
  common: {
    search: "Search",
    retry: "Retry",
    searchPlaceholder: "Search or jump to…",
    searching: "Searching…",
    noResults: "No matches",
    groupNav: "Navigate",
    groupPosts: "Posts",
    groupAssets: "Assets",
    groupHabits: "Habits",
    groupCategories: "Categories",
    groupTags: "Tags",
  },
  nav: {
    brand: "Felix Console",
    overview: "Overview",
    invest: "Invest",
    learn: "Learn",
    life: "Life",
    blog: "Blog",
    blogArchive: "Blog archive",
  },
  topbar: {
    toggleTheme: "Toggle theme",
    userMenu: "User menu",
    admin: "Admin",
    language: "Language",
  },
  dashboard: {
    greeting: "Hello, {{name}}",
    subtitle: "This is your personal console overview",
    portfolio: "Portfolio",
    addAsset: "Add an asset",
    showNumbers: "Show amounts",
    hideNumbers: "Hide amounts",
    pnlWithPct: "{{amount}} ({{pct}})",
    todayStudy: "Study today",
    streakDays: "{{n}}-day streak",
    noStudyToday: "No study yet today",
    habitCheckin: "Habits",
    createHabit: "Create a habit",
    noCheckinToday: "Not checked in today",
    checkedInToday: "Checked in today",
    publishedPosts: "Published posts",
    comments: "Comments",
    photos: "Photos",
    valueCurve: "Value curve (last 30 days · CNY)",
    numbersHidden: "Amounts hidden",
    curveEmpty: "Log trades and accumulate daily snapshots to generate a curve",
    habitHeat: "Habit heatmap",
    heatEmpty: "Create a habit and check in to generate a heatmap",
  },
  errors: {
    loadFailed: "Failed to load",
    notFound: "Page not found",
    searchFailed: "Search failed",
  },
}

export default en
