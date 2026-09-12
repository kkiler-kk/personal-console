import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function Pagination({ page, total, size, onPageChange }) {
  const { t } = useTranslation()
  const totalPages = Math.ceil(total / size)
  if (totalPages <= 1) return null

  return (
    <div className="pagination">
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>{t('pagination.prev')}</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button key={p} className={p === page ? 'active' : ''} onClick={() => onPageChange(p)}>{p}</button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>{t('pagination.next')}</button>
    </div>
  )
}
