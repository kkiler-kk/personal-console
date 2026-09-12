import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { useTranslation } from 'react-i18next'

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTHS_ZH = ['一月', '二月', '三月', '四月', '五月', '六月',
  '七月', '八月', '九月', '十月', '十一月', '十二月']

function ArchiveSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 36, width: '30%', marginBottom: 36 }} />
      <div className="skeleton" style={{ height: 28, width: '15%', marginBottom: 14 }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton" style={{ height: 44, marginBottom: 4 }} />
      ))}
    </div>
  )
}

export default function Archive() {
  const { t } = useTranslation()
  const [archives, setArchives] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getArchive().then(data => {
      setArchives(data.archives || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) return <ArchiveSkeleton />

  const grouped = {}
  archives.forEach(a => {
    if (!grouped[a.year]) grouped[a.year] = []
    grouped[a.year].push(a)
  })

  return (
    <div>
      <h2 className="archive-header">{t('archive.title')}</h2>
      {Object.keys(grouped).length === 0 && (
        <p className="empty-state">{t('archive.empty')}</p>
      )}
      {Object.entries(grouped).sort((a, b) => b[0] - a[0]).map(([year, months]) => (
        <div key={year} className="archive-group">
          <div className="archive-year">{year}</div>
          <ul className="archive-months">
            {months.sort((a, b) => a.month - b.month).map(m => {
              const monthNames = t('nav.home') === '首页' ? MONTHS_ZH : MONTHS_EN
              return (
                <li key={m.month} className="archive-month">
                  <Link to={`/?year=${year}&month=${m.month}`}>
                    <span>{monthNames[m.month - 1]}</span>
                    <span className="archive-count">{m.count}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
