import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import PostCard from '../components/PostCard'
import { useTranslation } from 'react-i18next'

function TagSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 36, width: '40%', marginBottom: 28 }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton skeleton-card" />
      ))}
    </div>
  )
}

export default function TagPosts() {
  const { t } = useTranslation()
  const { name } = useParams()
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getPosts({ tag: name }).then(data => {
      setPosts(data.posts || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [name])

  if (loading) return <TagSkeleton />

  return (
    <div>
      <h2 className="section-header">{t('tagPosts.tag')}: {name}</h2>
      {posts.length === 0 ? (
        <p className="empty-state">{t('tagPosts.noPosts')}</p>
      ) : (
        <ul className="post-list">
          {posts.map(p => <PostCard key={p.id} post={p} />)}
        </ul>
      )}
    </div>
  )
}
