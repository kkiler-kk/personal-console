import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function Sidebar({ categories, tags }) {
  const { t } = useTranslation()
  if ((!categories || categories.length === 0) && (!tags || tags.length === 0)) return null

  return (
    <aside className="sidebar-card">
      {categories && categories.length > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">{t('admin.categories')}</h3>
          <ul className="sidebar-list">
            {categories.map(c => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tags && tags.length > 0 && (
        <div className="sidebar-section">
          <h3 className="sidebar-title">Tags</h3>
          <div className="sidebar-tags">
            {tags.map(tg => (
              <Link key={tg.id} className="tag" to={`/tag/${tg.name}`}>{tg.name}</Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
