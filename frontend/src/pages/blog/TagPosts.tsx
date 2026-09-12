import { useParams } from "react-router-dom"
import { PostListPage } from "./PostList"

export default function TagPosts() {
  const { name } = useParams<{ name: string }>()
  // key：切换标签时重挂载，重置分页
  return <PostListPage key={name} tag={name} title={`标签：${name}`} />
}
