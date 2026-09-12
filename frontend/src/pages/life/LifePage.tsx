import { Sprout } from "lucide-react"
import { HabitSection } from "./HabitSection"
import { NoteSection } from "./NoteSection"
import { GallerySection } from "./GalleryLightbox"

// 三区块纵排：习惯打卡（热力图）→ 随手记 → 照片墙（灯箱）
export default function LifePage() {
  return (
    <div className="max-w-5xl space-y-5">
      {/* h1 文案「生活」必须保留：冒烟测试选择器 h1:has-text("生活") 依赖 */}
      <h1 className="flex items-center gap-2 text-xl font-semibold"><Sprout className="size-5" /> 生活</h1>
      <HabitSection />
      <NoteSection />
      <GallerySection />
    </div>
  )
}
