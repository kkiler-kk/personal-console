import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import toast from 'react-hot-toast'
import MDEditor from '@uiw/react-md-editor'
import Profile, { getAvatarUrl } from './Profile'
import Gallery from './Gallery'

// -- Post List --
function PostList() {
  const { t } = useTranslation()
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')

  const loadPosts = () => {
    const params = { page, size: 10 }
    if (statusFilter) params.status = statusFilter
    api.getAdminPosts(params).then(data => {
      setPosts(data.posts || [])
      setTotal(data.total || 0)
    })
  }

  useEffect(() => { loadPosts() }, [page, statusFilter])

  const handleDelete = async (id) => {
    if (!confirm(t('admin.deleteConfirm'))) return
    await api.deletePost(id)
    toast.success(t('admin.delete') + ' ✓')
    loadPosts()
  }

  return (
    <div>
      <div className="admin-header">
        <h2 className="admin-title">{t('admin.posts')}</h2>
        <div className="admin-actions">
          <select className="admin-filter" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">{t('admin.all')}</option>
            <option value="published">{t('admin.published')}</option>
            <option value="draft">{t('admin.draft')}</option>
          </select>
          <Link to="/admin/post/new" className="btn btn-primary btn-sm">{t('admin.newPost')}</Link>
        </div>
      </div>
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>{t('admin.title')}</th>
              <th>{t('admin.status')}</th>
              <th>{t('admin.views')}</th>
              <th>{t('admin.date')}</th>
              <th>{t('admin.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {posts.map(p => (
              <tr key={p.id}>
                <td><Link to={`/post/${p.slug}`}>{p.title}</Link></td>
                <td><span className={`tag ${p.status === 'published' ? 'tag--accent' : ''}`}>{p.status}</span></td>
                <td>{p.view_count}</td>
                <td>{new Date(p.created_at).toLocaleDateString('zh-CN')}</td>
                <td>
                  <Link to={`/admin/post/${p.id}`} className="btn btn-sm btn-secondary" style={{ marginRight: 6 }}>{t('admin.edit')}</Link>
                  <button
                    className="btn btn-sm btn-danger tooltip"
                    data-tooltip={t('admin.deleteRevert')}
                    onClick={() => handleDelete(p.id)}
                  >{t('admin.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > 10 && (
        <div className="pagination" style={{ marginTop: 16 }}>
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('pagination.prev')}</button>
          <button disabled={page >= Math.ceil(total / 10)} onClick={() => setPage(page + 1)}>{t('pagination.next')}</button>
        </div>
      )}
    </div>
  )
}

// -- Post Editor --
function PostEditor() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const postId = location.pathname.split('/').pop()
  const isNew = postId === 'new'
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    title: '', summary: '', content: '', category_id: '', status: 'published', tags: ''
  })
  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    api.getCategories().then(data => setCategories(data.categories || []))
    if (!isNew) {
      api.getAdminPosts({ size: 100 }).then(data => {
        const post = (data.posts || []).find(p => p.id === parseInt(postId))
        if (post) {
          setForm({
            title: post.title,
            summary: post.summary || '',
            content: post.content || '',
            category_id: post.category_id || '',
            status: post.status,
            tags: (post.tags || []).map(tg => tg.name).join(', '),
          })
        }
      })
    }
  }, [isNew, postId])

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    toast.loading('Uploading image...', { id: 'upload' })
    try {
      const data = await api.uploadImage(file)
      const imgTag = `![${file.name}](${data.url})`
      setForm(prev => ({ ...prev, content: prev.content + (prev.content ? '\n' : '') + imgTag }))
      toast.success('Image uploaded', { id: 'upload' })
    } catch (err) {
      toast.error(err.message, { id: 'upload' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const body = {
        ...form,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        tags: form.tags ? form.tags.split(',').map(tg => tg.trim()).filter(Boolean) : [],
      }
      if (isNew) {
        await api.createPost(body)
      } else {
        await api.updatePost(postId, body)
      }
      toast.success(t('admin.saved'))
      window.location.href = '/admin'
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const editorToolbarProps = {
    extraCommands: [
      {
        name: 'image-upload',
        keyCommand: 'image-upload',
        buttonProps: { 'aria-label': 'Insert image' },
        icon: (
          <span style={{ fontSize: 14, lineHeight: 1 }}>📷</span>
        ),
        execute: () => {
          fileInputRef.current?.click()
        },
      },
    ],
  }

  return (
    <div>
      <h2 className="admin-title" style={{ marginBottom: 24 }}>{isNew ? t('admin.newPostTitle') : t('admin.editPostTitle')}</h2>
      <form onSubmit={handleSubmit} style={{ maxWidth: 800 }}>
        <div className="form-group">
          <label>{t('admin.title')}</label>
          <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>{t('admin.summary')}</label>
          <input type="text" value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} />
        </div>
        <div className="form-group">
          <label>{t('admin.content')}</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleImageUpload}
          />
          <MDEditor
            value={form.content}
            onChange={val => setForm({ ...form, content: val || '' })}
            preview="live"
            height={420}
            {...editorToolbarProps}
            textareaProps={{
              placeholder: i18n.language === 'zh' ? '开始编写内容...' : 'Start writing...',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>{t('admin.category')}</label>
            <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })}>
              <option value="">{t('admin.none')}</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>{t('admin.status')}</label>
            <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="published">{t('admin.published')}</option>
              <option value="draft">{t('admin.draft')}</option>
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>{t('admin.tags')}</label>
          <input type="text" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} placeholder={t('admin.tagsPlaceholder')} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
            {saving ? t('admin.saving') : isNew ? t('admin.publish') : t('admin.update')}
          </button>
          {uploading && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Uploading...</span>}
          <Link to="/admin" className="btn btn-secondary">{t('admin.cancel')}</Link>
        </div>
      </form>
    </div>
  )
}

// -- Category Manager --
function CategoryManager() {
  const { t } = useTranslation()
  const [categories, setCategories] = useState([])
  const [newCat, setNewCat] = useState({ name: '', slug: '' })
  const [editing, setEditing] = useState(null)

  const loadCategories = () => {
    api.getCategories().then(data => setCategories(data.categories || []))
  }

  useEffect(() => { loadCategories() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newCat.name || !newCat.slug) {
      toast.error(t('admin.categoryRequired'))
      return
    }
    try {
      await api.createCategory(newCat)
      toast.success(t('admin.saved'))
      setNewCat({ name: '', slug: '' })
      loadCategories()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleUpdate = async (id, name, slug) => {
    try {
      await api.updateCategory(id, { name, slug })
      toast.success(t('admin.saved'))
      setEditing(null)
      loadCategories()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm(t('admin.deleteCategoryConfirm'))) return
    try {
      await api.deleteCategory(id)
      toast.success(t('admin.delete') + ' ✓')
      loadCategories()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <div>
      <h2 className="admin-title" style={{ marginBottom: 24 }}>{t('admin.categories')}</h2>
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <input type="text" placeholder={t('admin.categoryName')} value={newCat.name}
          onChange={e => setNewCat({ ...newCat, name: e.target.value })}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }} />
        <input type="text" placeholder={t('admin.categorySlug')} value={newCat.slug}
          onChange={e => setNewCat({ ...newCat, slug: e.target.value })}
          style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.875rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)' }} />
        <button className="btn btn-primary btn-sm" type="submit">{t('admin.add')}</button>
      </form>
      <div className="table-wrapper">
        <table className="table">
          <thead><tr><th>{t('admin.categoryName')}</th><th>{t('admin.categorySlug')}</th><th>{t('admin.actions')}</th></tr></thead>
          <tbody>
            {categories.map(c => (
              <tr key={c.id}>
                {editing === c.id ? (
                  <>
                    <td>
                      <input
                        type="text"
                        defaultValue={c.name}
                        id={`cat-name-${c.id}`}
                        style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)', width: '100%' }}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        defaultValue={c.slug}
                        id={`cat-slug-${c.id}`}
                        style={{ padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem', background: 'var(--bg-secondary)', color: 'var(--text-primary)', outline: 'none', fontFamily: 'var(--font-mono)', width: '100%' }}
                      />
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => {
                        const name = document.getElementById(`cat-name-${c.id}`).value
                        const slug = document.getElementById(`cat-slug-${c.id}`).value
                        handleUpdate(c.id, name, slug)
                      }}>{t('admin.update')}</button>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditing(null)}>{t('admin.cancel')}</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{c.name}</td>
                    <td>{c.slug}</td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditing(c.id)}>{t('admin.edit')}</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(c.id)}>{t('admin.delete')}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// -- Admin Layout --
export default function Admin() {
  const { isAuthenticated, loading } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()

  if (loading) return <p className="loading">{`> ${t('admin.authenticating')}`}</p>
  if (!isAuthenticated) return <Navigate to="/login" />

  const isActive = (path) => {
    if (path === '/admin') return location.pathname === '/admin'
    return location.pathname.startsWith(path)
  }

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <ul>
          <li><Link to="/admin" className={isActive('/admin') && !location.pathname.includes('/post/') && !location.pathname.includes('/profile') && !location.pathname.includes('/categories') && !location.pathname.includes('/gallery') ? 'active' : ''}>{t('admin.posts')}</Link></li>
          <li><Link to="/admin/post/new" className={location.pathname.includes('/post/') ? 'active' : ''}>{t('admin.newPost')}</Link></li>
          <li><Link to="/admin/categories" className={isActive('/admin/categories') ? 'active' : ''}>{t('admin.categories')}</Link></li>
          <li><Link to="/admin/gallery" className={isActive('/admin/gallery') ? 'active' : ''}>{t('gallery.title')}</Link></li>
          <li><Link to="/admin/profile" className={isActive('/admin/profile') ? 'active' : ''}>{t('profile.title')}</Link></li>
        </ul>
      </aside>
      <div className="admin-content">
        <Routes>
          <Route path="/" element={<PostList />} />
          <Route path="/post/new" element={<PostEditor />} />
          <Route path="/post/:id" element={<PostEditor />} />
          <Route path="/categories" element={<CategoryManager />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </div>
    </div>
  )
}
