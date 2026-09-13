// Español (es) — cadenas de interfaz. Espacios de nombres: common/nav/topbar/dashboard/errors.
// El conjunto de claves DEBE coincidir exactamente con zh.ts / en.ts (verificado por scripts/check-i18n.mjs).
// La interpolación usa la sintaxis de doble llave {{var}} de i18next; escapeValue desactivado (React escapa).
const es = {
  common: {
    search: "Buscar",
    retry: "Reintentar",
    searchPlaceholder: "Buscar o saltar a…",
    searching: "Buscando…",
    noResults: "Sin coincidencias",
    groupNav: "Navegación",
    groupPosts: "Artículos",
    groupAssets: "Activos",
    groupHabits: "Hábitos",
    groupCategories: "Categorías",
    groupTags: "Etiquetas",
  },
  nav: {
    brand: "Consola de Felix",
    overview: "Resumen",
    invest: "Invertir",
    learn: "Aprender",
    life: "Vida",
    blog: "Blog",
    blogArchive: "Archivo del blog",
  },
  topbar: {
    toggleTheme: "Cambiar tema",
    userMenu: "Menú de usuario",
    admin: "Admin",
    language: "Idioma",
  },
  dashboard: {
    greeting: "Hola, {{name}}",
    subtitle: "Este es el resumen de tu consola personal",
    portfolio: "Cartera",
    addAsset: "Añadir un activo",
    showNumbers: "Mostrar importes",
    hideNumbers: "Ocultar importes",
    pnlWithPct: "{{amount}} ({{pct}})",
    todayStudy: "Estudio de hoy",
    streakDays: "Racha de {{n}} días",
    noStudyToday: "Aún no has estudiado hoy",
    habitCheckin: "Hábitos",
    createHabit: "Crea un hábito",
    noCheckinToday: "Sin marcar hoy",
    checkedInToday: "Marcado hoy",
    publishedPosts: "Artículos publicados",
    comments: "Comentarios",
    photos: "Fotos",
    valueCurve: "Curva de valor (últimos 30 días · CNY)",
    numbersHidden: "Importes ocultos",
    curveEmpty: "Registra operaciones y acumula instantáneas diarias para generar la curva",
    habitHeat: "Mapa de hábitos",
    heatEmpty: "Crea un hábito y marca para generar el mapa",
  },
  errors: {
    loadFailed: "Error al cargar",
    notFound: "Página no encontrada",
    searchFailed: "Error de búsqueda",
  },
}

export default es
