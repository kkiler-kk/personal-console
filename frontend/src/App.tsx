import { Routes, Route } from "react-router-dom"
import { TrendingUp, Languages, Dumbbell, Compass } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { PagePlaceholder } from "@/components/PagePlaceholder"
import Login from "@/pages/Login"
import Dashboard from "@/pages/Dashboard"
import PostList from "@/pages/blog/PostList"
import PostDetail from "@/pages/blog/PostDetail"
import Archive from "@/pages/blog/Archive"
import CategoryPosts from "@/pages/blog/CategoryPosts"
import TagPosts from "@/pages/blog/TagPosts"
import LifePage from "@/pages/life/LifePage"
import AdminPosts from "@/pages/admin/AdminPosts"
import PostEditor from "@/pages/admin/PostEditor"
import AdminCategories from "@/pages/admin/AdminCategories"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invest" element={<PagePlaceholder title="投资" description="持仓与交易记录模块将在阶段 2 上线" icon={TrendingUp} />} />
        <Route path="/learn" element={<PagePlaceholder title="学习" description="生词本与 SRS 复习将在阶段 3 上线" icon={Languages} />} />
        <Route path="/fitness" element={<PagePlaceholder title="健身" description="训练日志与身体数据将在阶段 4 上线" icon={Dumbbell} />} />
        <Route path="/life" element={<LifePage />} />
        <Route path="/blog" element={<PostList />} />
        <Route path="/blog/archive" element={<Archive />} />
        <Route path="/blog/category/:slug" element={<CategoryPosts />} />
        <Route path="/blog/tag/:name" element={<TagPosts />} />
        <Route path="/blog/:slug" element={<PostDetail />} />
        <Route path="/admin/posts" element={<AdminPosts />} />
        <Route path="/admin/posts/new" element={<PostEditor />} />
        <Route path="/admin/posts/:id/edit" element={<PostEditor />} />
        <Route path="/admin/categories" element={<AdminCategories />} />
        <Route path="*" element={<PagePlaceholder title="404" description="页面不存在" icon={Compass} />} />
      </Route>
    </Routes>
  )
}
