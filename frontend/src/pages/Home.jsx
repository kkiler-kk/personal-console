import { useState, useEffect } from 'react'
import { api } from '../services/api'
import Hero from '../components/Hero'
import PostCard from '../components/PostCard'
import Sidebar from '../components/Sidebar'
import Pagination from '../components/Pagination'
import { useTranslation } from 'react-i18next'

function SkeletonLoader() {
  return (
    <div className="post-grid">
      <div className="skeleton skeleton-featured" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </div>
  )
}

export default function Home() {
  const { t } = useTranslation()
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [tags, setTags] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.getPosts({ page, size: 10 }),
      api.getCategories(),
      api.getTags(),
    ]).then(([postsData, catData, tagData]) => {
      setPosts(postsData.posts || [])
      setTotal(postsData.total || 0)
      setCategories(catData.categories || [])
      setTags(tagData.tags || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [page])

  if (loading) return <SkeletonLoader />

  const [featured, ...rest] = posts

  return (
    <div>
      <Hero />
      {posts.length === 0 ? (
        <p className="empty-state">{t('home.noPosts')}</p>
      ) : (
        <div className="post-grid">
          {featured && <PostCard key={featured.id} post={featured} featured />}
          {rest.map(p => <PostCard key={p.id} post={p} />)}
        </div>
      )}
      <Pagination page={page} total={total} size={10} onPageChange={setPage} />
      <Sidebar categories={categories} tags={tags} />
    </div>
  )
}
