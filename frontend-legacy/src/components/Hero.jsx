import { useTranslation } from 'react-i18next'

export default function Hero() {
  const { t } = useTranslation()
  return (
    <div className="hero">
      <div className="hero-orb hero-orb--1" />
      <div className="hero-orb hero-orb--2" />
      <div className="hero-orb hero-orb--3" />
      <div className="hero-grid-overlay" />
      <h1 className="hero-title">{t('hero.title')}<span className="hero-cursor" /></h1>
      <p className="hero-subtitle">{t('hero.subtitle')}</p>
      <div className="hero-divider" />
    </div>
  )
}
