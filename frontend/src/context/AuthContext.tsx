import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { api } from "@/lib/api"
import type { AuthUser } from "@/lib/types"

interface AuthCtx {
  user: AuthUser | null
  token: string | null
  isAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"))
  const [user, setUser] = useState<AuthUser | null>(() => {
    const raw = localStorage.getItem("user")
    return raw ? (JSON.parse(raw) as AuthUser) : null
  })

  // 启动时用 profile 校验 token 有效性；失败则清理
  useEffect(() => {
    if (!token) return
    api.getProfile()
      .then((p) => {
        const u = { id: p.id, username: p.username, nickname: p.nickname, avatar: p.avatar }
        setUser(u); localStorage.setItem("user", JSON.stringify(u))
      })
      .catch(() => { setToken(null); setUser(null); localStorage.removeItem("token"); localStorage.removeItem("user") })
  }, [token])

  const login = async (username: string, password: string) => {
    const { token: t, user: u } = await api.login(username, password)
    localStorage.setItem("token", t); localStorage.setItem("user", JSON.stringify(u))
    setToken(t); setUser(u)
  }
  const logout = () => {
    localStorage.removeItem("token"); localStorage.removeItem("user")
    setToken(null); setUser(null)
  }

  // 单用户站点：登录者即管理员（后端“第一个用户是管理员”）
  return <Ctx.Provider value={{ user, token, isAdmin: !!token, login, logout }}>{children}</Ctx.Provider>
}
