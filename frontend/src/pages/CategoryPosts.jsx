import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../services/api'
import PostCard from '../components/PostCard'
import { useTranslation } from 'react-i18next'

function CategorySkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 36, width: '40%', marginBottom: 28 }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  )
}

export default function CategoryPosts() {
  const { t } = useTranslation()
  const { slug } = useParams()
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getPosts({ category: slug }),
      api.getCategories(),
    ]).then(([data, catData]) => {
      setPosts(data.posts || [])
      setCategories(catData.categories || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [slug])

  if (loading) return <CategorySkeleton />

  const currentCategory = categories.find(c => c.slug === slug)

  return (
    <div>
      <h2 className="section-header">{currentCategory ? currentCategory.name : slug}</h2>
      {posts.length === 0 ? (
        <p className="empty-state">{t('categoryPosts.noPosts')}</p>
      ) : (
        <ul className="post-list">
          {posts.map(p => <PostCard key={p.id} post={p} />)}
        </ul>
      )}
    </div>
  )
}
