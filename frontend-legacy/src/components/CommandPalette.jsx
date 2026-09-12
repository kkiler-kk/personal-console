import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTheme } from '../context/ThemeContext'

export default function CommandPalette({ onClose, onToggleTheme, onOpenTerminal }) {
  const { t } = useTranslation()
  const { theme } = useTheme()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef(null)

  const themeLabel = theme === 'light' ? t('commandPalette.themeDark') :
                     theme === 'dark' ? t('commandPalette.themeTerminal') :
                     t('commandPalette.themeLight')

  const commands = [
    { id: 'home', label: t('commandPalette.goHome'), icon: '/', action: (n) => n('/') },
    { id: 'archive', label: t('commandPalette.archive'), icon: '/archive', action: (n) => n('/archive') },
    { id: 'admin', label: t('commandPalette.admin'), icon: '/admin', action: (n) => n('/admin') },
    { id: 'login', label: t('commandPalette.login'), icon: '/login', action: (n) => n('/login') },
    { id: 'theme', label: themeLabel, icon: '', action: (n, toggle) => toggle?.() },
    { id: 'terminal', label: t('commandPalette.openTerminal'), icon: '~', action: (n, _, onTerminal) => onTerminal?.() },
  ]

  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = commands.filter(c =>
    c.label.toLowerCase().includes(query.toLowerCase()) ||
    c.icon.includes(query.toLowerCase())
  )

  useEffect(() => { setSelected(0) }, [query])

  const execute = (cmd) => {
    cmd.action(navigate, onToggleTheme, onOpenTerminal)
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && filtered[selected]) {
      execute(filtered[selected])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="command-palette" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="command-palette-box">
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder={t('commandPalette.placeholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="command-palette-list">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">{t('commandPalette.noResults')} "{query}"</div>
          ) : (
            filtered.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`command-palette-item ${i === selected ? 'selected' : ''}`}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setSelected(i)}
              >
                <span>{cmd.label}</span>
                {cmd.icon && <span className="shortcut">{cmd.icon}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
