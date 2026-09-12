import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import toast from 'react-hot-toast'

import { getAvatarUrl } from '../utils/avatar'

export { getAvatarUrl }

export default function Profile() {
  const { t } = useTranslation()
  const { user, setUser } = useAuth()
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({ nickname: '', bio: '', avatar: '' })
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    api.getProfile().then(data => {
      setForm({
        nickname: data.nickname || '',
        bio: data.bio || '',
        avatar: data.avatar || '',
      })
    }).catch(() => {})
  }, [])

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    toast.loading(t('profile.uploading'), { id: 'avatar-upload' })
    try {
      const data = await api.uploadImage(file)
      setForm(prev => ({ ...prev, avatar: data.url }))
      toast.success(t('profile.uploadSuccess'), { id: 'avatar-upload' })
    } catch (err) {
      toast.error(err.message, { id: 'avatar-upload' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateProfile(form)
      toast.success(t('profile.saved'))
      // refresh auth context
      api.getProfile().then(setUser).catch(() => {})
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="admin-title" style={{ marginBottom: 24 }}>{t('profile.title')}</h2>
      <form onSubmit={handleSubmit} style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
          <img
            src={getAvatarUrl(form.avatar)}
            alt="avatar"
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }}
          />
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleAvatarUpload}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? t('profile.uploading') : t('profile.uploadAvatar')}
            </button>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 6 }}>
              {t('profile.avatarHint')}
            </p>
          </div>
        </div>

        <div className="form-group">
          <label>{t('auth.username')}</label>
          <input type="text" value={user?.username || ''} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
        </div>

        <div className="form-group">
          <label>{t('auth.nickname')}</label>
          <input type="text" value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} />
        </div>

        <div className="form-group">
          <label>{t('profile.bio')}</label>
          <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={4}
            placeholder={t('profile.bioPlaceholder')} />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" type="submit" disabled={saving || uploading}>
            {saving ? t('admin.saving') : t('profile.save')}
          </button>
        </div>
      </form>
    </div>
  )
}
