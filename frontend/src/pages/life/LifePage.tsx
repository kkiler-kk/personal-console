import { Sprout } from "lucide-react"
import { useTranslation } from "react-i18next"
import { HabitSection } from "./HabitSection"
import { NoteSection } from "./NoteSection"
import { GallerySection } from "./GalleryLightbox"

// 三区块纵排：习惯打卡（热力图）→ 随手记 → 照片墙（灯箱）
export default function LifePage() {
  const { t } = useTranslation()
  return (
    <div className="max-w-5xl space-y-5">
      {/* h1 走 nav.life：zh 值「生活」逐字钉死——冒烟 step 6/10 选择器 h1:has-text("生活") 依赖 */}
      <h1 className="flex items-center gap-2 text-xl font-semibold"><Sprout className="size-5" /> {t("nav.life")}</h1>
      <HabitSection />
      <NoteSection />
      <GallerySection />
    </div>
  )
}
