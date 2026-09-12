import { createContext, useContext, useState, useEffect } from 'react'

const themes = ['light', 'dark', 'terminal']

const ThemeContext = createContext({ theme: 'light', toggleTheme: () => {}, setTheme: () => {} })

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light'
  })

  useEffect(() => {
    const isTerminal = theme === 'terminal'
    document.documentElement.classList.toggle('dark', theme === 'dark' || isTerminal)
    document.documentElement.classList.toggle('terminal', isTerminal)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(t => {
      const idx = themes.indexOf(t)
      return themes[(idx + 1) % themes.length]
    })
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
