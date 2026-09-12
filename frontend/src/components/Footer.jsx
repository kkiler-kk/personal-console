import { useTranslation } from 'react-i18next'

export default function Footer() {
  const { t } = useTranslation()
  return (
    <footer className="footer">
      <div className="container">
        <p>&copy; {new Date().getFullYear()} {t('brand')} — {t('footer')}</p>
      </div>
    </footer>
  )
}
