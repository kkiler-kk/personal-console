import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { PostListPage } from "./PostList"

export default function TagPosts() {
  const { t } = useTranslation()
  const { name } = useParams<{ name: string }>()
  // key：切换标签时重挂载，重置分页
  return <PostListPage key={name} tag={name} title={t("blog.tagTitle", { name: name ?? "" })} />
}
