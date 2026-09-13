import { useParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { PostListPage } from "./PostList"

export default function CategoryPosts() {
  const { t } = useTranslation()
  const { slug } = useParams<{ slug: string }>()
  const { data } = useQuery({ queryKey: ["categories"], queryFn: api.getCategories })
  const name = data?.categories.find((c) => c.slug === slug)?.name ?? slug ?? ""
  // key：切换分类时重挂载，重置分页
  return <PostListPage key={slug} category={slug} title={t("blog.categoryTitle", { name })} />
}
