import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../services/api'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
import CommentSection from '../components/CommentSection'

function PostDetailSkeleton() {
  return (
    <div className="post-detail">
      <div className="skeleton" style={{ height: 48, width: '80%', marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 24 }} />
      <div className="skeleton" style={{ height: 200, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 200, marginBottom: 16 }} />
      <div className="skeleton" style={{ height: 120 }} />
    </div>
  )
}

function Segfault() {
  const { t } = useTranslation()
  return (
    <div className="segfault">
      <div className="segfault-ascii">{`
    ╔═══════════════════════════╗
    ║  [1]    1337 segmentation  ║
    ║         fault (core dumped) ║
    ╚═══════════════════════════╝
      `}</div>
      <div className="segfault-title">{t('postDetail.notFound.title')}</div>
      <p className="segfault-msg">
        {t('postDetail.notFound.message')}<br />
        {t('postDetail.notFound.message2')} <Link to="/">{t('postDetail.notFound.goHome')}</Link>
      </p>
    </div>
  )
}

export default function PostDetail() {
  const { t, i18n } = useTranslation()
  const { slug } = useParams()
  const locale = i18n.language === 'zh' ? 'zh-CN' : 'en-US'
  const [post, setPost] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getPost(slug)
      .then(data => { setPost(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [slug])

  if (loading) return <PostDetailSkeleton />
  if (!post) return <Segfault />

  const date = new Date(post.created_at).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <article className="post-detail">
      <h1>{post.title}</h1>
      <div className="post-meta">
        <span>{date}</span>
        {post.category && <Link to={`/category/${post.category.slug}`}>{post.category.name}</Link>}
        <span>{t('postDetail.views', { count: post.view_count })}</span>
      </div>
      {post.tags && post.tags.length > 0 && (
        <div className="post-detail-tags">
          {post.tags.map(tg => (
            <Link key={tg.id} className="tag tag--accent" to={`/tag/${tg.name}`}>{tg.name}</Link>
          ))}
        </div>
      )}
      <div className="post-content">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            table: ({ node, ...props }) => (
              <div className="table-wrapper"><table {...props} /></div>
            ),
          }}
        >{post.content}</ReactMarkdown>
      </div>
      <CommentSection slug={slug} />
    </article>
  )
}
