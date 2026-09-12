import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useTranslation } from 'react-i18next'
import { getAvatarUrl } from '../utils/avatar'

export default function Header() {
  const { user, isAuthenticated, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { t, i18n } = useTranslation()

  const toggleLang = () => {
    const next = i18n.language === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('locale', next)
  }

  return (
    <header className="header">
      <div className="container">
        <div className="header-brand tooltip" data-tooltip="TODO: rewrite in Rust">
          <Link to="/">{t('brand')}</Link>
        </div>
        <nav className="nav">
          <Link className="nav-link" to="/">{t('nav.home')}</Link>
          <Link className="nav-link" to="/archive">{t('nav.archive')}</Link>
          {isAuthenticated ? (
            <>
              <Link className="nav-link" to="/admin">{t('nav.admin')}</Link>
              <Link to="/admin/profile" className="nav-user" style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <img src={getAvatarUrl(user?.avatar)} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                <span>{user?.nickname || user?.username}</span>
              </Link>
              <button className="btn btn-sm btn-ghost" onClick={logout}>{t('nav.logout')}</button>
            </>
          ) : (
            <Link className="nav-link" to="/login">{t('nav.login')}</Link>
          )}
          <span className="kbd-hint" title={t('commandPalette.placeholder')}>⌘K</span>
          <button className="theme-toggle" onClick={toggleLang} title={t('langToggle')}>
            {i18n.language === 'zh' ? 'EN' : '中'}
          </button>
          <button className="theme-toggle" onClick={toggleTheme} title={
            theme === 'dark' ? 'Switch to terminal mode' :
            theme === 'terminal' ? 'Switch to light mode' :
            'Switch to dark mode'
          }>
            {theme === 'dark' ? '⌨️' :
             theme === 'terminal' ? '☀️' :
             '🌙'}
          </button>
        </nav>
      </div>
    </header>
  )
}
