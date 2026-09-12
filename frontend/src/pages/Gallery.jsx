import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { api } from '../services/api'
import toast from 'react-hot-toast'

export default function Gallery() {
  const { t } = useTranslation()
  const [items, setItems] = useState([])
  const [uploading, setUploading] = useState(false)
  const [selected, setSelected] = useState(null)
  const fileInputRef = useRef(null)

  const loadGallery = useCallback(() => {
    api.getGallery().then(data => setItems(data.items || []))
  }, [])

  useEffect(() => { loadGallery() }, [loadGallery])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    toast.loading(t('gallery.uploading'), { id: 'gallery-upload' })
    try {
      await api.uploadImage(file)
      toast.success(t('gallery.uploadSuccess'), { id: 'gallery-upload' })
      loadGallery()
    } catch (err) {
      toast.error(err.message, { id: 'gallery-upload' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleMultiUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setUploading(true)
    for (const file of files) {
      try {
        await api.uploadImage(file)
      } catch {
        toast.error(`${file.name}: ${t('gallery.uploadFailed')}`)
      }
    }
    toast.success(t('gallery.uploadComplete'))
    setUploading(false)
    loadGallery()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDelete = async (filename) => {
    if (!confirm(t('gallery.deleteConfirm'))) return
    await api.deleteGalleryFile(filename)
    toast.success(t('gallery.deleted'))
    loadGallery()
    if (selected === filename) setSelected(null)
  }

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(window.location.origin + url)
    toast.success(t('gallery.copied'))
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div>
      <h2 className="admin-title" style={{ marginBottom: 24 }}>{t('gallery.title')}</h2>

      <div style={{ marginBottom: 24, display: 'flex', gap: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleMultiUpload}
        />
        <button className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? t('gallery.uploading') : t('gallery.upload')}
        </button>
      </div>

      {items.length === 0 ? (
        <div className="empty-state">{t('gallery.empty')}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {items.map(item => (
              <div
                key={item.filename}
                style={{
                  position: 'relative',
                  borderRadius: 'var(--radius-md)',
                  border: selected === item.filename ? '2px solid var(--accent)' : '1px solid var(--border)',
                  overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onClick={() => setSelected(selected === item.filename ? null : item.filename)}
              >
                <img
                  src={item.url}
                  alt={item.filename}
                  style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }}
                />
                <div style={{ padding: '8px 10px', fontSize: '0.7rem', fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.filename}</div>
                  <div>{formatSize(item.size)}</div>
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div style={{ marginTop: 24, padding: 20, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <img
                  src={items.find(i => i.filename === selected)?.url}
                  alt={selected}
                  style={{ width: 200, borderRadius: 'var(--radius-sm)', objectFit: 'contain', background: 'var(--bg-tertiary)' }}
                />
                <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>{selected}</p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    {formatSize(items.find(i => i.filename === selected)?.size || 0)}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: 16 }}>
                    {new Date(items.find(i => i.filename === selected)?.mod_time || '').toLocaleString('zh-CN')}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => handleCopyUrl(items.find(i => i.filename === selected)?.url || '')}>
                      {t('gallery.copyUrl')}
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(selected)}>
                      {t('admin.delete')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
