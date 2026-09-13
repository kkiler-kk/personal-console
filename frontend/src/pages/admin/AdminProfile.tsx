import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import type { AuthUser } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"
import { ErrorState, errorText } from "@/components/ErrorState"
import { AdminNav } from "@/components/admin/AdminNav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

type Profile = AuthUser & { bio: string; created_at: string }

// 表单以 initial 直接初始化 state（不用 effect 回填）；父组件用 key=dataUpdatedAt 重挂载，
// 保存后 refetch 触发重挂载即回填最新值——与 HabitDialog/ProfileDialog 的 key-remount 惯例一致
function ProfileForm({ initial }: { initial: Profile }) {
  const { t } = useTranslation()
  const { refresh } = useAuth()
  const qc = useQueryClient()
  const [nickname, setNickname] = useState(initial.nickname ?? "")
  const [avatar, setAvatar] = useState(initial.avatar ?? "")
  const [bio, setBio] = useState(initial.bio ?? "")

  const save = useMutation({
    mutationFn: async () => {
      await api.updateProfile({ nickname: nickname.trim(), avatar: avatar.trim(), bio: bio.trim() })
      // 保存成功后立即重拉 user state：Topbar 头像/菜单与 Dashboard 问候语即时刷新
      await refresh()
    },
    onSuccess: () => {
      toast.success(t("admin.toast.saved"))
      qc.invalidateQueries({ queryKey: ["profile"] })
      qc.invalidateQueries({ queryKey: ["dashboard"] })
    },
    onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : t("common.saveFailed")),
  })

  const canSubmit = nickname.trim() !== "" && !save.isPending

  return (
    <Card className="shadow-[0_1px_3px_rgba(0,0,0,.06)]">
      <CardContent className="p-5 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="admin-profile-nickname">{t("admin.profile.nickname")}</Label>
          <Input id="admin-profile-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)}
            maxLength={50} placeholder={t("admin.profile.nicknamePlaceholder")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-profile-avatar">{t("admin.profile.avatar")}</Label>
          <div className="flex items-center gap-3">
            <Input id="admin-profile-avatar" value={avatar} onChange={(e) => setAvatar(e.target.value)}
              maxLength={500} placeholder="https://…" className="flex-1" />
            {avatar.trim() && (
              // key=src：URL 变更即重挂（display 归零）；onError 隐藏碎图标兜底
              <img key={avatar.trim()} src={avatar.trim()} onError={(e) => { e.currentTarget.style.display = "none" }}
                className="size-10 shrink-0 rounded-full object-cover" alt={t("admin.profile.avatarAlt")} />
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="admin-profile-bio">{t("admin.profile.bio")}</Label>
          <Textarea id="admin-profile-bio" rows={4} value={bio} onChange={(e) => setBio(e.target.value)}
            maxLength={500} placeholder={t("admin.profile.bioPlaceholder")} />
        </div>
        <div className="flex justify-end">
          <Button disabled={!canSubmit} onClick={() => save.mutate()}>
            {save.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminProfile() {
  const { t } = useTranslation()
  const { data, isPending, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["profile"],
    queryFn: api.getProfile,
  })

  return (
    <div className="max-w-3xl space-y-4">
      <AdminNav />
      <div>
        <h1 className="text-xl font-semibold">{t("admin.profile.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.profile.desc")}</p>
      </div>

      {isError ? (
        <ErrorState title={t("admin.profile.loadFailed")} message={errorText(error)} onRetry={refetch} />
      ) : isPending || !data ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <ProfileForm key={dataUpdatedAt} initial={data} />
      )}
    </div>
  )
}
