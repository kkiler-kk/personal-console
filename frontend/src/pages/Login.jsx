import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { api } from '../services/api'
import { useTranslation } from 'react-i18next'

export default function Login() {
  const { login } = useAuth()
  const navigate = (path) => { window.location.href = path }
  const { t } = useTranslation()
  const [isRegister, setIsRegister] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', nickname: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isRegister) {
        await api.register(form)
        setIsRegister(false)
        setError(t('auth.loginSuccess'))
      } else {
        await login(form.username, form.password)
        navigate('/admin')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <h2 className="auth-title">{isRegister ? t('auth.register') : t('auth.login')}</h2>
      <form onSubmit={handleSubmit}>
        {isRegister && (
          <div className="form-group">
            <label>{t('auth.nickname')}</label>
            <input
              type="text"
              value={form.nickname}
              onChange={e => setForm({ ...form, nickname: e.target.value })}
              placeholder={t('auth.nickname')}
              required
            />
          </div>
        )}
        <div className="form-group">
          <label>{t('auth.username')}</label>
          <input
            type="text"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            placeholder={t('auth.username')}
            required
          />
        </div>
        <div className="form-group">
          <label>{t('auth.password')}</label>
          <input
            type="password"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            placeholder="••••••••"
            required
            minLength={6}
          />
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary" type="submit" style={{ width: '100%', padding: '12px 20px', fontSize: '0.9rem' }} disabled={loading}>
          {isRegister ? t('auth.registerBtn') : loading ? t('auth.authenticating') : t('auth.loginBtn')}
        </button>
      </form>
      <p className="auth-toggle">
        {isRegister ? (
          <>{t('auth.hasAccount')} <Link to="/login" onClick={() => setIsRegister(false)}>{t('auth.loginBtn')}</Link></>
        ) : (
          <>{t('auth.noAccount')} <Link to="/login" onClick={() => setIsRegister(true)}>{t('auth.registerBtn')}</Link></>
        )}
      </p>
    </div>
  )
}
