import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

const COMMANDS = {
  help: `Available commands:
  help          Show this help message
  ls            List blog pages
  cat <page>    View page content
  whoami        Show current user
  date          Show current date/time
  echo <msg>    Echo a message
  clear         Clear terminal
  exit          Close terminal
  sudo rm -rf /  Don't.
  fortune       Random fortune
  cowsay <msg>  Cow says your message
  matrix        Wake up, Neo...`,

  ls: `  /          Home
  /archive   Archive
  /admin     Admin Panel
  /login     Login/Register
  /category  Categories
  /tag       Tags`,

  date: () => `  ${new Date().toLocaleString('zh-CN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,

  clear: null,
  exit: null,
}

const FORTUNES = [
  'The best way to predict the future is to implement it.',
  'Talk is cheap. Show me the code. — Linus Torvalds',
  'First, solve the problem. Then, write the code.',
  'It works on my machine. ¯\\_(ツ)_/¯',
  'There are only two hard things in CS: cache invalidation, naming things, and off-by-one errors.',
  '99 little bugs in the code, take one down, patch it around, 127 little bugs in the code.',
  'A SQL query walks into a bar, sees two tables, and asks: "Can I JOIN you?"',
  '!false — It\'s funny because it\'s true.',
  'To understand recursion, you must first understand recursion.',
]

const COW = (msg) => `
  ${'_'.repeat(msg.length + 2)}
< ${msg} >
  ${'-'.repeat(msg.length + 2)}
        \\   ^__^
         \\  (oo)\\_______
            (__)\\       )\\/\\
                ||----w |
                ||     ||`

export default function TerminalOverlay({ onClose }) {
  const { user } = useAuth()
  const [history, setHistory] = useState([
    { type: 'info', text: 'Welcome to My Blog Terminal v1.0.0' },
    { type: 'info', text: 'Type "help" for available commands.\n' },
  ])
  const [input, setInput] = useState('')
  const [cmdHistory, setCmdHistory] = useState([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [history])

  const execute = (cmd) => {
    const trimmed = cmd.trim()
    if (!trimmed) return

    const parts = trimmed.split(/\s+/)
    const command = parts[0].toLowerCase()
    const args = parts.slice(1)

    const newHistory = [...history, { type: 'input', text: `$ ${trimmed}` }]

    if (command === 'exit') {
      onClose()
      return
    }

    if (command === 'clear') {
      setHistory([{ type: 'info', text: 'Terminal cleared.\n' }])
      setCmdHistory(prev => [...prev, trimmed])
      return
    }

    if (command === 'help') {
      newHistory.push({ type: 'success', text: COMMANDS.help })
    } else if (command === 'ls') {
      newHistory.push({ type: 'success', text: COMMANDS.ls })
    } else if (command === 'whoami') {
      const name = user?.nickname || user?.username || 'anonymous'
      newHistory.push({ type: 'success', text: `  ${name}` })
    } else if (command === 'date') {
      newHistory.push({ type: 'success', text: COMMANDS.date() })
    } else if (command === 'echo') {
      newHistory.push({ type: 'success', text: `  ${args.join(' ') || ''}` })
    } else if (command === 'cat') {
      const page = args[0]
      if (!page) {
        newHistory.push({ type: 'error', text: '  cat: missing file operand. Try: cat home' })
      } else if (['home', 'archive', 'admin', 'login'].includes(page)) {
        newHistory.push({ type: 'success', text: `  Opening /${page}... (use the nav instead, lazy dev 😏)` })
      } else {
        newHistory.push({ type: 'error', text: `  cat: ${page}: No such file or directory` })
      }
    } else if (command === 'sudo') {
      if (args.join(' ') === 'rm -rf /') {
        newHistory.push({ type: 'error', text: '  Nice try. 😏' })
      } else {
        newHistory.push({ type: 'error', text: '  Permission denied. This is not that kind of terminal.' })
      }
    } else if (command === 'fortune') {
      const f = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]
      newHistory.push({ type: 'success', text: `\n  ${f}\n` })
    } else if (command === 'cowsay') {
      const msg = args.join(' ') || 'moo'
      newHistory.push({ type: 'success', text: COW(msg) })
    } else if (command === 'matrix') {
      newHistory.push({ type: 'success', text: '  Wake up, Neo... (try the Konami Code: ↑↑↓↓←→←→BA)' })
    } else {
      newHistory.push({ type: 'error', text: `  command not found: ${command}\n  Type "help" for available commands.` })
    }

    newHistory.push({ text: '' })
    setHistory(newHistory)
    setCmdHistory(prev => [...prev, trimmed])
    setHistoryIndex(-1)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      execute(input)
      setInput('')
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (cmdHistory.length > 0) {
        const newIndex = historyIndex === -1 ? cmdHistory.length - 1 : Math.max(0, historyIndex - 1)
        setHistoryIndex(newIndex)
        setInput(cmdHistory[newIndex] || '')
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1
        if (newIndex >= cmdHistory.length) {
          setHistoryIndex(-1)
          setInput('')
        } else {
          setHistoryIndex(newIndex)
          setInput(cmdHistory[newIndex])
        }
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="terminal-overlay">
      <div className="terminal-header">
        <div className="terminal-dots">
          <div className="terminal-dot terminal-dot--red" />
          <div className="terminal-dot terminal-dot--yellow" />
          <div className="terminal-dot terminal-dot--green" />
        </div>
        <div className="terminal-title">my-blog — terminal</div>
        <button className="terminal-close" onClick={onClose}>&times;</button>
      </div>
      <div className="terminal-body" ref={bodyRef}>
        {history.map((line, i) => (
          <div key={i} className={`terminal-output ${line.type || ''}`}>{line.text}</div>
        ))}
        <div className="terminal-input-line">
          <span className="terminal-prompt">$</span>
          <input
            ref={inputRef}
            className="terminal-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  )
}
