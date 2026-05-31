import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import BookCard from '../components/BookCard'

function getWeekDateRange(weekStr) {
  if (!weekStr) return ''
  const [year, week] = weekStr.split('-W').map(Number)
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const fmt = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} – ${fmt(sunday)}`
}

export default function Home() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState(null)

  const fetchWeekly = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/weekly')
      if (!res.ok) throw new Error('Failed to load weekly picks')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegenerate = async () => {
    try {
      setRegenerating(true)
      setError(null)
      const res = await fetch('/api/weekly/regenerate', { method: 'POST' })
      if (!res.ok) throw new Error('Failed to regenerate picks')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError(err.message)
    } finally {
      setRegenerating(false)
    }
  }

  useEffect(() => {
    fetchWeekly()
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Hero banner */}
      <div className="rainbow-bg rounded-3xl p-8 mb-8 text-center shadow-xl">
        <div className="text-5xl mb-3">📚</div>
        <h1
          className="text-white text-4xl md:text-5xl mb-2 drop-shadow-lg"
          style={{ fontFamily: '"Fredoka One", cursive' }}
        >
          Bell Smedley Book Club!
        </h1>
        <p className="text-white/90 text-lg font-bold">
          This Week's Amazing Book Picks ✨
        </p>
        {data?.week_of && (
          <p className="text-white/80 text-sm mt-1 font-semibold">
            Week of {getWeekDateRange(data.week_of)} ({data.week_of})
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-100 border-2 border-red-300 text-red-700 rounded-2xl p-4 mb-6 font-bold text-center">
          😬 {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-6xl animate-bounce">📖</div>
          <p className="text-purple-500 font-bold text-xl">Loading this week's picks...</p>
        </div>
      )}

      {/* No picks */}
      {!loading && data?.books?.length === 0 && (
        <div className="text-center py-16">
          <div className="text-7xl mb-4">🤔</div>
          <h2
            className="text-3xl text-purple-600 mb-3"
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            No picks yet this week!
          </h2>
          <p className="text-gray-500 font-semibold mb-6">
            Add some books to the library first, then generate picks!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/add"
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-8 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-lg"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              ➕ Add a Book
            </Link>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-gradient-to-r from-orange-400 to-yellow-400 text-white font-bold px-8 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-lg disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              {regenerating ? '🎲 Picking...' : '🎲 Pick Books!'}
            </button>
          </div>
        </div>
      )}

      {/* Books grid */}
      {!loading && data?.books?.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🌟</span>
              <h2
                className="text-2xl text-purple-700"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                This Week's {data.books.length} Picks!
              </h2>
            </div>
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-gradient-to-r from-orange-400 to-yellow-400 text-white font-bold px-6 py-2.5 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              {regenerating ? '🎲 Picking...' : '🎲 Pick New Books'}
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {data.books.map((book, i) => (
              <div key={book.id} className="bounce-in" style={{ animationDelay: `${i * 0.07}s` }}>
                <BookCard book={book} index={i} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
