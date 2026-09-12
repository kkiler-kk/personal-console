import './i18n'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import Layout from './components/Layout'
import { Toaster } from 'react-hot-toast'

import Home from './pages/Home'
import PostDetail from './pages/PostDetail'
import Archive from './pages/Archive'
import CategoryPosts from './pages/CategoryPosts'
import TagPosts from './pages/TagPosts'
import Login from './pages/Login'
import Admin from './pages/Admin'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/post/:slug" element={<PostDetail />} />
            <Route path="/archive" element={<Archive />} />
            <Route path="/category/:slug" element={<CategoryPosts />} />
            <Route path="/tag/:name" element={<TagPosts />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin/*" element={<Admin />} />
          </Routes>
        </Layout>
        <Toaster position="top-center" toastOptions={{ duration: 3000 }} />
      </AuthProvider>
    </ThemeProvider>
  )
}
