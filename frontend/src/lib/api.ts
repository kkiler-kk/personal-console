import type { AuthUser, Category, Comment, DashboardSummary, GalleryItem, Post, PostListResp, ArchiveItem, Tag, Asset, AssetType, PriceSource, Trade, PositionsResp, PositionsHistoryResp } from "./types"

const BASE = "/api"

function getToken(): string | null { return localStorage.getItem("token") }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) }
  const isForm = options.body instanceof FormData
  if (!isForm) headers["Content-Type"] = "application/json"
  const token = getToken()
  if (token) headers["Authorization"] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { ...options, headers })
  } catch {
    // 断网/DNS 失败等网络层异常：包装为 ApiError(0)，保证下游 instanceof ApiError 判断一致
    throw new ApiError(0, "网络连接失败，请检查后端服务")
  }
  // 有意使用 any：后端各端点响应形态不一，且需兼容 204/空 body 的宽松解析
  let data: any = null
  try { data = await res.json() } catch { /* 204 等无 body 场景 */ }
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("token"); localStorage.removeItem("user")
      if (!location.pathname.startsWith("/login")) location.href = "/login"
    }
    throw new ApiError(res.status, data?.error || `请求失败 (${res.status})`)
  }
  return data as T
}

const qs = (p: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams()
  Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "") s.set(k, String(v)) })
  const str = s.toString()
  return str ? `?${str}` : ""
}

export interface PostInput { title: string; summary?: string; content: string; tags?: string[]; category_id?: number | null; status?: "published" | "draft" }

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: AuthUser }>("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  getProfile: () => request<AuthUser & { bio: string; created_at: string }>("/user/profile"),
  updateProfile: (body: { nickname?: string; avatar?: string; bio?: string }) =>
    request<{ message: string }>("/user/profile", { method: "PUT", body: JSON.stringify(body) }),

  getPosts: (p: { page?: number; size?: number; category?: string; tag?: string; year?: number; month?: number } = {}) =>
    request<PostListResp>(`/posts${qs(p)}`),
  getPost: (slug: string) => request<Post>(`/posts/${slug}`),
  getArchive: () => request<{ archives: ArchiveItem[] }>("/posts/archive"),
  getAdminPosts: (p: { page?: number; size?: number } = {}) => request<PostListResp>(`/admin/posts${qs(p)}`),
  createPost: (body: PostInput) => request<{ id: number; slug: string }>("/posts", { method: "POST", body: JSON.stringify(body) }),
  updatePost: (id: number, body: PostInput) => request<{ message: string }>(`/posts/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deletePost: (id: number) => request<{ message: string }>(`/posts/${id}`, { method: "DELETE" }),

  getCategories: () => request<{ categories: Category[] }>("/categories"),
  createCategory: (body: { name: string; slug: string; section?: string }) =>
    request<{ id: number }>("/categories", { method: "POST", body: JSON.stringify(body) }),
  updateCategory: (id: number, body: { name: string; slug: string; section?: string }) =>
    request<{ message: string }>(`/categories/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteCategory: (id: number) => request<{ message: string }>(`/categories/${id}`, { method: "DELETE" }),
  getTags: () => request<{ tags: Tag[] }>("/tags"),

  getComments: (slug: string, email?: string) =>
    request<{ comments: Comment[]; total: number }>(`/posts/${slug}/comments${qs({ email })}`),
  createComment: (slug: string, body: { name: string; email: string; content: string; parent_id?: number }) =>
    request<Comment>(`/posts/${slug}/comments`, { method: "POST", body: JSON.stringify(body) }),
  likeComment: (id: number, email: string) =>
    request<{ like_count: number; liked: boolean }>(`/comments/${id}/like`, { method: "POST", body: JSON.stringify({ email }) }),
  checkLike: (id: number, email: string) => request<{ liked: boolean }>(`/comments/${id}/like${qs({ email })}`),
  deleteComment: (id: number, email?: string) =>
    request<{ message: string }>(`/comments/${id}`, { method: "DELETE", body: email ? JSON.stringify({ email }) : undefined }),

  uploadImage: (file: File) => {
    const fd = new FormData(); fd.append("image", file)
    return request<{ url: string }>("/upload", { method: "POST", body: fd })
  },
  getGallery: () => request<{ items: GalleryItem[]; total: number }>("/gallery"),
  deleteGalleryFile: (filename: string) => request<{ message: string }>(`/gallery/${filename}`, { method: "DELETE" }),

  getDashboardSummary: () => request<DashboardSummary>("/dashboard/summary"),

  getAssets: () => request<{ assets: Asset[] }>("/assets"),
  createAsset: (body: { symbol: string; name: string; type: AssetType; price_source: PriceSource; currency: "USD" | "CNY" }) =>
    request<{ id: number }>("/assets", { method: "POST", body: JSON.stringify(body) }),
  updateAsset: (id: number, body: { name: string }) => request<{ message: string }>(`/assets/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteAsset: (id: number) => request<{ message: string }>(`/assets/${id}`, { method: "DELETE" }),
  updateAssetPrice: (id: number, price: number) => request<{ message: string }>(`/assets/${id}/price`, { method: "PUT", body: JSON.stringify({ price }) }),
  getTrades: (assetId?: number) => request<{ trades: Trade[] }>(`/trades${qs({ asset_id: assetId })}`),
  createTrade: (body: { asset_id: number; side: "buy" | "sell"; quantity: number; price: number; fee: number; traded_at: string; note?: string }) =>
    request<{ id: number }>("/trades", { method: "POST", body: JSON.stringify(body) }),
  deleteTrade: (id: number) => request<{ message: string }>(`/trades/${id}`, { method: "DELETE" }),
  getPositions: () => request<PositionsResp>("/positions"),
  getPositionsHistory: (days = 90) => request<PositionsHistoryResp>(`/positions/history${qs({ days })}`),
  getPriceHistory: (symbol: string, days = 90) => request<{ points: { date: string; close: number }[] }>(`/price-history${qs({ symbol, days })}`),
}
