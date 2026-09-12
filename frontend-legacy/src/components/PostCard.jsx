import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function PostCard({ post, featured }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US'
  const date = new Date(post.created_at).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <li className={`post-card${featured ? ' featured' : ''}`}>
      <div className="post-card-glow" />
      <h2 className="post-card-title">
        <Link to={`/post/${post.slug}`}>{post.title}</Link>
      </h2>
      <div className="post-meta">
        <span>{date}</span>
        {post.category && <Link to={`/category/${post.category.slug}`}>{post.category.name}</Link>}
        <span>{t('postDetail.views', { count: post.view_count })}</span>
      </div>
      {post.summary && <p className="post-summary">{post.summary}</p>}
      {post.tags && post.tags.length > 0 && (
        <div className="post-tags">
          {post.tags.map(tg => (
            <Link key={tg.id} className="tag" to={`/tag/${tg.name}`}>{tg.name}</Link>
          ))}
        </div>
      )}
    </li>
  )
}
