import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import BookCard from '../components/BookCard'

export default function Library() {
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  // Bulk refresh state
  const [refreshing, setRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState(null) // { done, total, skipped }

  const fetchBooks = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/books')
      if (!res.ok) throw new Error('Failed to load books')
      const data = await res.json()
      setBooks(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBooks()
  }, [])

  const handleRefreshAll = async () => {
    const eligible = books.filter(b => b.isbn)
    if (!eligible.length) return
    setRefreshing(true)
    setRefreshProgress({ done: 0, total: eligible.length, skipped: 0 })
    let skipped = 0
    for (let i = 0; i < eligible.length; i++) {
      const book = eligible[i]
      try {
        const res = await fetch(`/api/books/${book.id}`, { method: 'PATCH' })
        if (res.ok) {
          const updated = await res.json()
          setBooks(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
        } else {
          skipped++
        }
      } catch {
        skipped++
      }
      setRefreshProgress({ done: i + 1, total: eligible.length, skipped })
      // Small delay between requests to avoid rate-limiting
      if (i < eligible.length - 1) await new Promise(r => setTimeout(r, 300))
    }
    setRefreshing(false)
  }

  const filtered = books.filter((b) => {
    const q = search.toLowerCase()
    return (
      b.title?.toLowerCase().includes(q) ||
      b.author?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-400 via-teal-400 to-green-400 rounded-3xl p-6 mb-8 shadow-xl text-center">
        <div className="text-4xl mb-2">📖</div>
        <h1
          className="text-white text-4xl drop-shadow"
          style={{ fontFamily: '"Fredoka One", cursive' }}
        >
          The Book Library
        </h1>
        <p className="text-white/80 font-semibold mt-1">
          {books.length} book{books.length !== 1 ? 's' : ''} in the club
        </p>
        {books.some(b => b.isbn) && (
          <button
            onClick={handleRefreshAll}
            disabled={refreshing || loading}
            className="mt-3 bg-white/20 hover:bg-white/30 text-white font-bold px-5 py-2 rounded-full text-sm transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            {refreshing
              ? `🔄 Refreshing… ${refreshProgress?.done}/${refreshProgress?.total}`
              : '🔄 Refresh All Covers & Titles'}
          </button>
        )}
        {!refreshing && refreshProgress && (
          <p className="text-white/80 text-sm font-semibold mt-1">
            ✅ Done! {refreshProgress.total - refreshProgress.skipped} updated
            {refreshProgress.skipped > 0 ? `, ${refreshProgress.skipped} skipped` : ''}
          </p>
        )}
      </div>

      {/* Search bar */}
      <div className="relative mb-6">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">🔍</span>
        <input
          type="text"
          placeholder="Search by title or author..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-purple-200 bg-white shadow-sm focus:outline-none focus:border-purple-400 font-semibold text-gray-700 placeholder-gray-400 text-base"
          style={{ fontFamily: 'Nunito, sans-serif' }}
        />
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
          <div className="text-6xl animate-bounce">📚</div>
          <p className="text-teal-500 font-bold text-xl">Loading the library...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && books.length === 0 && (
        <div className="text-center py-16">
          <div className="text-7xl mb-4">📚</div>
          <h2
            className="text-3xl text-teal-600 mb-3"
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            No books yet!
          </h2>
          <p className="text-gray-500 font-semibold mb-6">
            Be the first to add a book to the club!
          </p>
          <Link
            to="/add"
            className="bg-gradient-to-r from-teal-500 to-green-500 text-white font-bold px-8 py-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 text-lg inline-block"
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            ➕ Add the First Book!
          </Link>
        </div>
      )}

      {/* No search results */}
      {!loading && books.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">🔍</div>
          <p className="text-gray-500 font-bold text-lg">No books match "{search}"</p>
          <button
            onClick={() => setSearch('')}
            className="mt-3 text-purple-500 font-bold hover:underline"
          >
            Clear search
          </button>
        </div>
      )}

      {/* Books grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((book, i) => (
            <div key={book.id} className="bounce-in" style={{ animationDelay: `${i * 0.04}s` }}>
              <BookCard book={book} index={i} />
            </div>
          ))}
        </div>
      )}

      {/* Add book FAB */}
      <Link
        to="/add"
        className="fixed bottom-6 right-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white w-16 h-16 rounded-full shadow-xl flex items-center justify-center text-2xl hover:scale-110 transition-all duration-200 hover:shadow-2xl"
        title="Add a book"
      >
        ➕
      </Link>
    </div>
  )
}
