import { Routes, Route } from "react-router-dom"
import { Compass } from "lucide-react"
import { AppLayout } from "@/components/layout/AppLayout"
import { ProtectedRoute } from "@/components/ProtectedRoute"
import { PagePlaceholder } from "@/components/PagePlaceholder"
import Login from "@/pages/Login"
import Dashboard from "@/pages/Dashboard"
import InvestPage from "@/pages/invest/InvestPage"
import LearnPage from "@/pages/learn/LearnPage"
import PostList from "@/pages/blog/PostList"
import PostDetail from "@/pages/blog/PostDetail"
import Archive from "@/pages/blog/Archive"
import CategoryPosts from "@/pages/blog/CategoryPosts"
import TagPosts from "@/pages/blog/TagPosts"
import LifePage from "@/pages/life/LifePage"
import AdminOverview from "@/pages/admin/AdminOverview"
import AdminPosts from "@/pages/admin/AdminPosts"
import PostEditor from "@/pages/admin/PostEditor"
import AdminCategories from "@/pages/admin/AdminCategories"
import AdminSessions from "@/pages/admin/AdminSessions"
import AdminHabits from "@/pages/admin/AdminHabits"
import AdminProfile from "@/pages/admin/AdminProfile"

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/invest" element={<InvestPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/life" element={<LifePage />} />
        <Route path="/blog" element={<PostList />} />
        <Route path="/blog/archive" element={<Archive />} />
        <Route path="/blog/category/:slug" element={<CategoryPosts />} />
        <Route path="/blog/tag/:name" element={<TagPosts />} />
        <Route path="/blog/:slug" element={<PostDetail />} />
        <Route path="/admin" element={<AdminOverview />} />
        <Route path="/admin/posts" element={<AdminPosts />} />
        <Route path="/admin/posts/new" element={<PostEditor />} />
        <Route path="/admin/posts/:id/edit" element={<PostEditor />} />
        <Route path="/admin/categories" element={<AdminCategories />} />
        <Route path="/admin/sessions" element={<AdminSessions />} />
        <Route path="/admin/habits" element={<AdminHabits />} />
        <Route path="/admin/profile" element={<AdminProfile />} />
        <Route path="*" element={<PagePlaceholder title="404" description="页面不存在" icon={Compass} />} />
      </Route>
    </Routes>
  )
}
