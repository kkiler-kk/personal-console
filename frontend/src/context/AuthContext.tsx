import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { AuthUser } from "@/lib/types"

interface AuthCtx {
  user: AuthUser | null
  /** 重拉 profile 刷新 user state（用于资料保存后同步 Topbar/Dashboard）；mount 时也调用 */
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthCtx>(null!)
export const useAuth = () => useContext(Ctx)

// 单用户本地部署：无 token/login/logout。mount 时拉 profile 组 user；
// 失败仅 toast 不阻塞——站点照常可用，仅问候语/头像缺失
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)

  const refresh = async () => {
    try {
      const p = await api.getProfile()
      setUser({ id: p.id, username: p.username, nickname: p.nickname, avatar: p.avatar })
    } catch {
      toast.error("加载用户信息失败")
    }
  }

  useEffect(() => { refresh() }, [])

  return <Ctx.Provider value={{ user, refresh }}>{children}</Ctx.Provider>
}
