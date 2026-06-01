import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import StarPicker from '../components/StarPicker'
import StarRating from '../components/StarRating'

// Format a datetime string for display
function fmtDate(str) {
  if (!str) return ''
  const d = new Date(str.includes('T') ? str : str.replace(' ', 'T') + 'Z')
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// Returns current local datetime as value for <input type="datetime-local">
function nowLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [coverError, setCoverError] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState(null)

  // Ratings state
  const [thumbsUp, setThumbsUp] = useState(0)
  const [thumbsDown, setThumbsDown] = useState(0)
  const [avgStars, setAvgStars] = useState(null)
  const [starCount, setStarCount] = useState(0)
  const [comments, setComments] = useState([])
  const [selectedThumb, setSelectedThumb] = useState(null)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [animatingThumb, setAnimatingThumb] = useState(null)

  // Star rating
  const [pendingStar, setPendingStar] = useState(0)
  const [submittingStar, setSubmittingStar] = useState(false)
  const [starSubmitted, setStarSubmitted] = useState(false)
  const [starError, setStarError] = useState(null)

  // Read log state
  const [reads, setReads] = useState([])
  const [showReadForm, setShowReadForm] = useState(false)
  const [readDateTime, setReadDateTime] = useState(nowLocal())
  const [loggingRead, setLoggingRead] = useState(false)
  const [deletingReadId, setDeletingReadId] = useState(null)

  const fetchBook = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/books/${id}`)
      if (!res.ok) throw new Error('Book not found')
      const data = await res.json()
      setBook(data)
      setThumbsUp(data.thumbs_up ?? 0)
      setThumbsDown(data.thumbs_down ?? 0)
      setAvgStars(data.avg_stars ?? null)
      setStarCount(data.star_count ?? 0)
      setComments(data.comments ?? [])
      setReads(data.reads ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchBook() }, [id])

  // ── Star rating ──────────────────────────────────────────────────────────
  const handleStarSubmit = async (stars) => {
    if (!stars || submittingStar || starSubmitted) return
    setSubmittingStar(true)
    setStarError(null)
    try {
      const res = await fetch(`/api/books/${id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save rating')
      setAvgStars(data.avg_stars)
      setStarCount(data.star_count)
      setStarSubmitted(true)
    } catch (err) {
      setStarError(err.message)
    } finally {
      setSubmittingStar(false)
    }
  }

  // ── Thumbs + comment ─────────────────────────────────────────────────────
  const handleRating = async (thumbs) => {
    if (!thumbs) return
    setAnimatingThumb(thumbs)
    setTimeout(() => setAnimatingThumb(null), 300)
    try {
      setSubmitError(null)
      setSubmitting(true)
      const res = await fetch(`/api/books/${id}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbs, comment: comment.trim() || undefined }),
      })
      if (!res.ok) throw new Error('Failed to submit')
      const data = await res.json()
      setThumbsUp(data.thumbs_up)
      setThumbsDown(data.thumbs_down)
      if (comment.trim()) {
        setComments(prev => [
          { id: Date.now(), thumbs, stars: null, comment: comment.trim(), created_at: new Date().toISOString() },
          ...prev,
        ])
        setComment('')
      }
      setSelectedThumb(thumbs)
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitComment = async (e) => {
    e.preventDefault()
    if (!selectedThumb && !comment.trim()) {
      setSubmitError('Pick 👍 or 👎 before submitting!')
      return
    }
    await handleRating(selectedThumb || 'up')
  }

  // ── Read log ──────────────────────────────────────────────────────────────
  const handleLogRead = async () => {
    setLoggingRead(true)
    try {
      // Convert local datetime-local value to ISO
      const dt = new Date(readDateTime)
      const res = await fetch(`/api/books/${id}/reads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read_at: dt.toISOString().replace('T', ' ').slice(0, 19) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setReads(prev => [data, ...prev])
      setShowReadForm(false)
      setReadDateTime(nowLocal())
    } catch (err) {
      alert('Could not log read: ' + err.message)
    } finally {
      setLoggingRead(false)
    }
  }

  const handleDeleteRead = async (readId) => {
    if (!window.confirm('Remove this read entry?')) return
    setDeletingReadId(readId)
    try {
      await fetch(`/api/books/${id}/reads/${readId}`, { method: 'DELETE' })
      setReads(prev => prev.filter(r => r.id !== readId))
    } finally {
      setDeletingReadId(null)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'PATCH' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Refresh failed')
      setBook(prev => ({ ...prev, ...data }))
      setCoverError(false)
      setRefreshMsg('✅ Metadata updated!')
    } catch (err) {
      setRefreshMsg(`😬 ${err.message}`)
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshMsg(null), 4000)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Remove "${book.title}" from the library? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/books/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      navigate('/library')
    } catch {
      setDeleting(false)
      alert('Could not remove the book. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <div className="text-6xl animate-bounce">📖</div>
        <p className="text-purple-500 font-bold text-xl">Loading book...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="text-5xl mb-4">😬</div>
        <p className="text-red-600 font-bold text-lg mb-4">{error}</p>
        <button onClick={() => navigate('/library')}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-6 py-2 rounded-full">
          ← Back to Library
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Top bar */}
      <div className="relative flex items-center justify-between mb-6">
        <button onClick={() => navigate('/library')}
          className="flex items-center gap-2 text-purple-600 font-bold hover:text-purple-800 transition-colors group">
          <span className="group-hover:-translate-x-1 transition-transform">←</span>
          Back to Library
        </button>
        <div className="flex items-center gap-3">
          {book?.isbn && (
            <button onClick={handleRefresh} disabled={refreshing || deleting}
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-600 font-bold text-sm transition-colors disabled:opacity-50"
              title="Re-fetch title, cover and metadata from the internet">
              {refreshing ? '⏳ Refreshing...' : '🔄 Refresh'}
            </button>
          )}
          <button onClick={handleDelete} disabled={deleting || refreshing}
            className="flex items-center gap-1.5 text-red-400 hover:text-red-600 font-bold text-sm transition-colors disabled:opacity-50">
            🗑️ {deleting ? 'Removing...' : 'Remove from library'}
          </button>
        </div>
        {refreshMsg && (
          <span className="text-xs font-bold text-gray-500 absolute top-16 right-4">{refreshMsg}</span>
        )}
      </div>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-purple-200">
        <div className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 h-3" />

        <div className="p-6 md:p-8">
          {/* Book info */}
          <div className="flex flex-col md:flex-row gap-8">
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <div className="w-44 md:w-52 rounded-2xl overflow-hidden shadow-lg border-4 border-white ring-4 ring-purple-200">
                {book.cover_url && !coverError ? (
                  <img src={book.cover_url} alt={`Cover of ${book.title}`}
                    className="w-full aspect-[2/3] object-cover"
                    onLoad={(e) => { if (e.currentTarget.naturalWidth <= 1) setCoverError(true) }}
                    onError={() => setCoverError(true)} />
                ) : (
                  <div className="w-full aspect-[2/3] bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center">
                    <span className="text-6xl">📖</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1">
              <h1 className="text-3xl md:text-4xl text-purple-800 mb-2" style={{ fontFamily: '"Fredoka One", cursive' }}>
                {book.title}
              </h1>
              {book.author && <p className="text-gray-600 font-bold text-lg mb-1">✍️ {book.author}</p>}
              <div className="flex flex-wrap gap-3 mb-4">
                {book.publisher && <span className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full">🏢 {book.publisher}</span>}
                {book.year && <span className="bg-yellow-100 text-yellow-700 text-sm font-bold px-3 py-1 rounded-full">📅 {book.year}</span>}
                {book.isbn && <span className="bg-gray-100 text-gray-600 text-sm font-semibold px-3 py-1 rounded-full">ISBN: {book.isbn}</span>}
              </div>

              {/* Summary stats */}
              <div className="flex flex-wrap gap-3 mb-3">
                {avgStars ? (
                  <div className="flex items-center gap-2 bg-yellow-50 border-2 border-yellow-200 rounded-2xl px-3 py-2">
                    <StarPicker value={Math.round(avgStars)} size="sm" readonly />
                    <span className="text-yellow-700 font-bold text-sm">{avgStars} / 5</span>
                    <span className="text-gray-400 text-xs">({starCount})</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-2 bg-gray-50 border-2 border-gray-200 rounded-2xl px-3 py-2">
                  <span className="text-sm font-bold text-green-600">👍 {thumbsUp}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-sm font-bold text-red-500">👎 {thumbsDown}</span>
                </div>
                {reads.length > 0 && (
                  <div className="flex items-center gap-2 bg-teal-50 border-2 border-teal-200 rounded-2xl px-3 py-2">
                    <span className="text-sm font-bold text-teal-600">📖 Read {reads.length}×</span>
                  </div>
                )}
              </div>

              {book.description && (
                <p className="text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">
                  {book.description}
                </p>
              )}
            </div>
          </div>

          {/* ── STAR RATING ─────────────────────────────────────── */}
          <div className="mt-8 border-t-2 border-purple-100 pt-6">
            <h2 className="text-2xl text-purple-700 mb-4" style={{ fontFamily: '"Fredoka One", cursive' }}>
              ⭐ Rate this book
            </h2>

            {starSubmitted ? (
              <div className="bounce-in flex items-center gap-3 bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4">
                <StarPicker value={pendingStar} size="lg" readonly />
                <div>
                  <p className="text-yellow-700 font-bold" style={{ fontFamily: '"Fredoka One", cursive' }}>
                    You gave it {pendingStar} star{pendingStar !== 1 ? 's' : ''}!
                  </p>
                  <button onClick={() => { setStarSubmitted(false); setPendingStar(0) }}
                    className="text-yellow-600 text-xs underline mt-0.5">
                    Change rating
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <StarPicker
                    value={pendingStar}
                    onChange={(v) => { setPendingStar(v); setStarError(null) }}
                    size="xl"
                  />
                  {pendingStar > 0 && (
                    <button
                      onClick={() => handleStarSubmit(pendingStar)}
                      disabled={submittingStar}
                      className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold px-5 py-2.5 rounded-full shadow-md hover:scale-105 transition-all duration-200 disabled:opacity-50"
                      style={{ fontFamily: '"Fredoka One", cursive' }}
                    >
                      {submittingStar ? '⏳' : '✨ Submit'}
                    </button>
                  )}
                </div>
                {pendingStar > 0 && (
                  <p className="text-gray-500 text-sm font-semibold">
                    {['', '😬 Not great...', '😐 It was okay', '🙂 Pretty good!', '😄 Really good!', '🤩 Amazing!!'][pendingStar]}
                  </p>
                )}
                {starError && (
                  <p className="text-red-500 font-bold text-sm">😬 {starError}</p>
                )}
              </div>
            )}
          </div>

          {/* ── READ TODAY ──────────────────────────────────────── */}
          <div className="mt-8 border-t-2 border-teal-100 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl text-teal-700" style={{ fontFamily: '"Fredoka One", cursive' }}>
                📖 Reading log
              </h2>
              {!showReadForm && (
                <button
                  onClick={() => { setReadDateTime(nowLocal()); setShowReadForm(true) }}
                  className="bg-gradient-to-r from-teal-400 to-cyan-400 text-white font-bold px-5 py-2 rounded-full shadow-md hover:scale-105 transition-all duration-200 text-sm"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  📖 Mark as Read
                </button>
              )}
            </div>

            {/* Log read form */}
            {showReadForm && (
              <div className="bounce-in bg-teal-50 border-2 border-teal-200 rounded-2xl p-4 mb-4">
                <p className="text-teal-700 font-bold mb-3" style={{ fontFamily: '"Fredoka One", cursive' }}>
                  When did you read it?
                </p>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <input
                    type="datetime-local"
                    value={readDateTime}
                    onChange={(e) => setReadDateTime(e.target.value)}
                    className="px-3 py-2 rounded-xl border-2 border-teal-200 focus:outline-none focus:border-teal-400 font-semibold text-gray-700 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleLogRead}
                      disabled={loggingRead}
                      className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-bold px-5 py-2 rounded-full shadow-md hover:scale-105 transition-all duration-200 disabled:opacity-50 text-sm"
                      style={{ fontFamily: '"Fredoka One", cursive' }}
                    >
                      {loggingRead ? '⏳ Saving...' : '✅ Log it!'}
                    </button>
                    <button
                      onClick={() => setShowReadForm(false)}
                      className="bg-gray-100 text-gray-500 font-bold px-3 py-2 rounded-full hover:bg-gray-200 transition-colors text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Read log list */}
            {reads.length === 0 ? (
              <p className="text-gray-400 font-semibold text-sm">No reads logged yet — tap "Mark as Read" after finishing the book!</p>
            ) : (
              <div className="flex flex-col gap-2">
                {reads.map((r, i) => (
                  <div key={r.id}
                    className="flex items-center justify-between bg-teal-50 border border-teal-100 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📖</span>
                      <div>
                        <p className="text-teal-800 font-bold text-sm">{fmtDate(r.read_at)}</p>
                        {i === 0 && <p className="text-teal-500 text-xs font-semibold">Most recent</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteRead(r.id)}
                      disabled={deletingReadId === r.id}
                      className="text-gray-300 hover:text-red-400 transition-colors text-sm disabled:opacity-50"
                      title="Remove this entry"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── THUMBS + COMMENT ────────────────────────────────── */}
          <div className="mt-8 border-t-2 border-purple-100 pt-6">
            <h2 className="text-2xl text-purple-700 mb-4" style={{ fontFamily: '"Fredoka One", cursive' }}>
              Quick reaction + comment 💬
            </h2>

            <div className="flex gap-4 mb-4">
              <button
                onClick={() => { setSelectedThumb('up'); handleRating('up') }}
                disabled={submitting}
                className={`flex-1 py-4 rounded-2xl text-4xl font-bold shadow-md transition-all duration-200 border-4 hover:scale-105 active:scale-95 ${
                  selectedThumb === 'up' ? 'bg-green-100 border-green-400 scale-105' : 'bg-white border-green-200 hover:bg-green-50 hover:border-green-300'
                } disabled:opacity-60 ${animatingThumb === 'up' ? 'pop' : ''}`}
              >
                👍
                <span className="block text-green-600 text-lg mt-1" style={{ fontFamily: '"Fredoka One", cursive' }}>{thumbsUp}</span>
              </button>

              <button
                onClick={() => { setSelectedThumb('down'); handleRating('down') }}
                disabled={submitting}
                className={`flex-1 py-4 rounded-2xl text-4xl font-bold shadow-md transition-all duration-200 border-4 hover:scale-105 active:scale-95 ${
                  selectedThumb === 'down' ? 'bg-red-100 border-red-400 scale-105' : 'bg-white border-red-200 hover:bg-red-50 hover:border-red-300'
                } disabled:opacity-60 ${animatingThumb === 'down' ? 'pop' : ''}`}
              >
                👎
                <span className="block text-red-600 text-lg mt-1" style={{ fontFamily: '"Fredoka One", cursive' }}>{thumbsDown}</span>
              </button>
            </div>

            <form onSubmit={handleSubmitComment} className="mt-4">
              <label className="block text-gray-700 font-bold mb-2">Leave a comment (optional) 💬</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you think? Would you recommend it?"
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border-2 border-purple-200 focus:outline-none focus:border-purple-400 font-semibold text-gray-700 placeholder-gray-400 resize-none"
                style={{ fontFamily: 'Nunito, sans-serif' }}
              />
              {submitError && <p className="text-red-500 font-bold text-sm mt-1">😬 {submitError}</p>}
              <button
                type="submit"
                disabled={submitting || !comment.trim()}
                className="mt-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-6 py-2.5 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                {submitting ? '⏳ Sending...' : '💬 Post Comment'}
              </button>
            </form>
          </div>

          {/* ── COMMENTS LIST ───────────────────────────────────── */}
          {comments.length > 0 && (
            <div className="mt-8 border-t-2 border-purple-100 pt-6">
              <h2 className="text-2xl text-purple-700 mb-4" style={{ fontFamily: '"Fredoka One", cursive' }}>
                Comments ({comments.length}) 💬
              </h2>
              <div className="flex flex-col gap-3">
                {comments.map((c) => (
                  <div key={c.id}
                    className={`rounded-2xl p-4 border-2 ${c.thumbs === 'up' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{c.thumbs === 'up' ? '👍' : '👎'}</span>
                      <div className="flex-1">
                        {c.comment && <p className="text-gray-700 font-semibold mb-1">{c.comment}</p>}
                        <p className="text-gray-400 text-xs">
                          {new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
