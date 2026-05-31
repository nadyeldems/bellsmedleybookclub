import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const links = [
    { to: '/', label: '🏠 Home' },
    { to: '/library', label: '📖 Library' },
    { to: '/add', label: '➕ Add Book' },
  ]

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 shadow-lg">
      <div className="bg-gradient-to-r from-purple-500 via-pink-400 to-orange-400">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2 group"
              onClick={() => setMenuOpen(false)}
            >
              <span className="text-2xl group-hover:animate-bounce inline-block">📚</span>
              <span
                className="text-white text-xl leading-tight hidden sm:block"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                Bell Smedley Book Club
              </span>
              <span
                className="text-white text-lg leading-tight sm:hidden"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                BSBC
              </span>
            </Link>

            {/* Desktop links */}
            <div className="hidden md:flex items-center gap-2">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-4 py-2 rounded-full font-bold text-sm transition-all duration-200 ${
                    isActive(link.to)
                      ? 'bg-white text-purple-600 shadow-md'
                      : 'text-white hover:bg-white/20'
                  }`}
                  style={{ fontFamily: 'Nunito, sans-serif' }}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-white p-2 rounded-lg hover:bg-white/20 transition-colors"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <div className="w-6 flex flex-col gap-1.5">
                <span className={`block h-0.5 bg-white rounded transition-all duration-300 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                <span className={`block h-0.5 bg-white rounded transition-all duration-300 ${menuOpen ? 'opacity-0' : ''}`} />
                <span className={`block h-0.5 bg-white rounded transition-all duration-300 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-gradient-to-b from-pink-400 to-orange-400 shadow-lg">
          <div className="px-4 py-3 flex flex-col gap-2">
            {links.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMenuOpen(false)}
                className={`px-4 py-3 rounded-xl font-bold text-base transition-all duration-200 ${
                  isActive(link.to)
                    ? 'bg-white text-purple-600 shadow-md'
                    : 'text-white hover:bg-white/20'
                }`}
                style={{ fontFamily: 'Nunito, sans-serif' }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  )
}
