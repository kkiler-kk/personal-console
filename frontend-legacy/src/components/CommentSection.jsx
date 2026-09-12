import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'

const COMMENT_EMAIL_KEY = 'comment_email'
const COMMENT_NAME_KEY = 'comment_name'

function timeAgo(dateStr, t) {
  const now = new Date()
  const date = new Date(dateStr)
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return t('comments.justNow')
  if (diff < 3600) return t('comments.minutesAgo', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('comments.hoursAgo', { count: Math.floor(diff / 3600) })
  return t('comments.daysAgo', { count: Math.floor(diff / 86400) })
}

function CommentForm({ slug, parentId, onSubmit, onCancel, t }) {
  const [name, setName] = useState(() => localStorage.getItem(COMMENT_NAME_KEY) || '')
  const [email, setEmail] = useState(() => localStorage.getItem(COMMENT_EMAIL_KEY) || '')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim()) { toast.error(t('comments.emailRequired')); return }
    if (!content.trim()) { toast.error(t('comments.contentRequired')); return }

    setSubmitting(true)
    try {
      const body = {
        name: name.trim(),
        email: email.trim(),
        content: content.trim(),
      }
      if (parentId) body.parent_id = parentId

      await api.createComment(slug, body)
      localStorage.setItem(COMMENT_EMAIL_KEY, email.trim())
      if (name.trim()) localStorage.setItem(COMMENT_NAME_KEY, name.trim())

      toast.success(parentId ? t('comments.replyPosted') : t('comments.posted'))
      setContent('')
      onSubmit?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      {parentId && (
        <div className="comment-form-header">
          <span className="comment-replying-to">
            {t('comments.replyingTo')} #{parentId}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
            {t('comments.cancelReply')}
          </button>
        </div>
      )}
      <div className="comment-form-row">
        <div className="form-group">
          <label>{t('comments.name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('comments.namePlaceholder')}
          />
        </div>
        <div className="form-group">
          <label>{t('comments.email')} *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('comments.emailPlaceholder')}
            required
          />
        </div>
      </div>
      <div className="form-group">
        <label>{t('comments.content')}</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('comments.contentPlaceholder')}
          rows={3}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
        {submitting ? t('comments.submitting') : t('comments.submit')}
      </button>
    </form>
  )
}

function CommentItem({ comment, slug, depth = 0, onReply, t, userEmail }) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(comment.like_count)
  const [liking, setLiking] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (userEmail) {
      api.checkLike(comment.id, userEmail).then(data => setLiked(data.liked)).catch(() => {})
    }
  }, [comment.id, userEmail])

  const handleLike = async () => {
    if (!userEmail) { toast.error(t('comments.emailRequired')); return }
    setLiking(true)
    try {
      const data = await api.likeComment(comment.id, userEmail)
      setLikeCount(data.like_count)
      setLiked(data.liked)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLiking(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await api.deleteComment(comment.id, userEmail)
      toast.success(t('comments.deleted'))
      onReply?.()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const displayName = comment.name || 'Anonymous'

  return (
    <div className="comment-item" style={{ marginLeft: depth > 0 ? '24px' : 0 }}>
      <div className="comment-header">
        <span className="comment-author">{displayName}</span>
        <span className="comment-time">{timeAgo(comment.created_at, t)}</span>
      </div>
      <div className="comment-content">{comment.content}</div>
      <div className="comment-actions">
        <button
          className={`comment-action-btn ${liked ? 'comment-action-btn--liked' : ''}`}
          onClick={handleLike}
          disabled={liking}
        >
          {liked ? t('comments.liked') : t('comments.like')}
          {likeCount > 0 && <span className="comment-like-count">{likeCount}</span>}
        </button>
        {depth < 2 && (
          <button className="comment-action-btn" onClick={() => onReply?.(comment.id)}>
            {t('comments.reply')}
          </button>
        )}
        {comment.can_delete && (
          <button
            className="comment-action-btn comment-action-btn--danger"
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t('comments.delete')}
          </button>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="comment-delete-confirm">
          <p>{t('comments.deleteConfirm')}</p>
          <div className="comment-delete-actions">
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {t('comments.delete')}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              {t('admin.cancel')}
            </button>
          </div>
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              slug={slug}
              depth={depth + 1}
              onReply={onReply}
              t={t}
              userEmail={userEmail}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function CommentSection({ slug }) {
  const { t } = useTranslation()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [replyTo, setReplyTo] = useState(null)
  const [userEmail] = useState(() => localStorage.getItem(COMMENT_EMAIL_KEY) || '')

  const fetchComments = useCallback(async () => {
    try {
      const data = await api.getComments(slug, userEmail || undefined)
      setComments(data.comments || [])
    } catch {
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [slug, userEmail])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  const handleReply = (commentId) => {
    setReplyTo((prev) => (prev === commentId ? null : commentId))
  }

  const handleSubmitted = () => {
    setReplyTo(null)
    fetchComments()
  }

  if (loading) return <p className="loading">{`> ${t('loading.fetching')}`}</p>

  return (
    <section className="comment-section">
      <h2 className="comment-section-title">{t('comments.title')}</h2>

      <CommentForm slug={slug} onSubmit={handleSubmitted} t={t} />

      {comments.length === 0 ? (
        <p className="comment-empty">{t('comments.noComments')}</p>
      ) : (
        <div className="comment-list">
          {comments.map((comment) => (
            <div key={comment.id}>
              <CommentItem
                comment={comment}
                slug={slug}
                onReply={handleReply}
                t={t}
                userEmail={userEmail}
              />
              {replyTo === comment.id && (
                <CommentForm
                  slug={slug}
                  parentId={comment.id}
                  onSubmit={handleSubmitted}
                  onCancel={() => setReplyTo(null)}
                  t={t}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
