import { useState, useEffect, useCallback } from 'react'
import Header from './Header'
import Footer from './Footer'
import MatrixRain from './MatrixRain'
import TerminalOverlay from './TerminalOverlay'
import CommandPalette from './CommandPalette'
import { useTheme } from '../context/ThemeContext'

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','KeyB','KeyA']

export default function Layout({ children }) {
  const { toggleTheme } = useTheme()
  const [showMatrix, setShowMatrix] = useState(false)
  const [showTerminal, setShowTerminal] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [konamiIndex, setKonamiIndex] = useState(0)

  const handleKeyDown = useCallback((e) => {
    // Escape closes everything
    if (e.key === 'Escape') {
      setShowMatrix(false)
      setShowTerminal(false)
      setShowPalette(false)
      return
    }

    // Cmd/Ctrl + K → Command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      if (!showMatrix && !showTerminal) {
        setShowPalette(p => !p)
      }
      return
    }

    // Tilde → Terminal (only when not in input)
    if (e.key === '`' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = document.activeElement?.tagName
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable
      if (!isInput && !showMatrix && !showPalette) {
        e.preventDefault()
        setShowTerminal(t => !t)
      }
      return
    }

    // Konami code
    if (!showMatrix && !showTerminal && !showPalette) {
      if (e.code === KONAMI[konamiIndex]) {
        const next = konamiIndex + 1
        setKonamiIndex(next)
        if (next === KONAMI.length) {
          setShowMatrix(true)
          setKonamiIndex(0)
        }
      } else if (e.code !== 'ShiftLeft' && e.code !== 'ShiftRight') {
        setKonamiIndex(0)
      }
    }
  }, [konamiIndex, showMatrix, showTerminal, showPalette])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <>
      <Header />
      <main className="container">{children}</main>
      <Footer />
      {showMatrix && <MatrixRain onClose={() => setShowMatrix(false)} />}
      {showTerminal && <TerminalOverlay onClose={() => setShowTerminal(false)} />}
      {showPalette && (
        <CommandPalette
          onClose={() => setShowPalette(false)}
          onToggleTheme={toggleTheme}
          onOpenTerminal={() => { setShowPalette(false); setShowTerminal(true) }}
        />
      )}
    </>
  )
}
