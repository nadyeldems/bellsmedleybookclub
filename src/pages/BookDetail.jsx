import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import StarRating from '../components/StarRating'

export default function BookDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [book, setBook] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [comment, setComment] = useState('')
  const [selectedThumb, setSelectedThumb] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [thumbsUp, setThumbsUp] = useState(0)
  const [thumbsDown, setThumbsDown] = useState(0)
  const [comments, setComments] = useState([])
  const [animatingThumb, setAnimatingThumb] = useState(null)
  const [coverError, setCoverError] = useState(false)

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
      setComments(data.comments ?? [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBook()
  }, [id])

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
        setComments((prev) => [
          { id: Date.now(), thumbs, comment: comment.trim(), created_at: new Date().toISOString() },
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
        <button
          onClick={() => navigate('/library')}
          className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-6 py-2 rounded-full"
        >
          ← Back to Library
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => navigate('/library')}
        className="flex items-center gap-2 text-purple-600 font-bold hover:text-purple-800 transition-colors mb-6 group"
      >
        <span className="group-hover:-translate-x-1 transition-transform">←</span>
        Back to Library
      </button>

      <div className="bg-white rounded-3xl shadow-xl overflow-hidden border-4 border-purple-200">
        <div className="bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 h-3" />

        <div className="p-6 md:p-8">
          <div className="flex flex-col md:flex-row gap-8">
            {/* Cover */}
            <div className="flex-shrink-0 mx-auto md:mx-0">
              <div className="w-44 md:w-52 rounded-2xl overflow-hidden shadow-lg border-4 border-white ring-4 ring-purple-200">
                {book.cover_url && !coverError ? (
                  <img
                    src={book.cover_url}
                    alt={`Cover of ${book.title}`}
                    className="w-full aspect-[2/3] object-cover"
                    onError={() => setCoverError(true)}
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-gradient-to-br from-purple-200 to-pink-200 flex items-center justify-center">
                    <span className="text-6xl">📖</span>
                  </div>
                )}
              </div>
            </div>

            {/* Info */}
            <div className="flex-1">
              <h1
                className="text-3xl md:text-4xl text-purple-800 mb-2"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                {book.title}
              </h1>

              {book.author && (
                <p className="text-gray-600 font-bold text-lg mb-1">
                  ✍️ {book.author}
                </p>
              )}

              <div className="flex flex-wrap gap-3 mb-4">
                {book.publisher && (
                  <span className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full">
                    🏢 {book.publisher}
                  </span>
                )}
                {book.year && (
                  <span className="bg-yellow-100 text-yellow-700 text-sm font-bold px-3 py-1 rounded-full">
                    📅 {book.year}
                  </span>
                )}
                {book.isbn && (
                  <span className="bg-gray-100 text-gray-600 text-sm font-semibold px-3 py-1 rounded-full">
                    ISBN: {book.isbn}
                  </span>
                )}
              </div>

              {/* Ratings summary */}
              <div className="mb-4">
                <StarRating thumbsUp={thumbsUp} thumbsDown={thumbsDown} />
                <p className="text-gray-400 text-xs mt-1 font-semibold">
                  {thumbsUp + thumbsDown} rating{thumbsUp + thumbsDown !== 1 ? 's' : ''}
                </p>
              </div>

              {book.description && (
                <p className="text-gray-600 text-sm leading-relaxed border-t border-gray-100 pt-4">
                  {book.description}
                </p>
              )}
            </div>
          </div>

          {/* Rating buttons */}
          <div className="mt-8 border-t-2 border-purple-100 pt-6">
            <h2
              className="text-2xl text-purple-700 mb-4"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              What do you think? 🤔
            </h2>

            <div className="flex gap-4 mb-4">
              <button
                onClick={() => { setSelectedThumb('up'); handleRating('up') }}
                disabled={submitting}
                className={`flex-1 py-4 rounded-2xl text-4xl font-bold shadow-md transition-all duration-200 border-4 hover:scale-105 active:scale-95 ${
                  selectedThumb === 'up'
                    ? 'bg-green-100 border-green-400 scale-105'
                    : 'bg-white border-green-200 hover:bg-green-50 hover:border-green-300'
                } disabled:opacity-60 disabled:cursor-not-allowed ${animatingThumb === 'up' ? 'pop' : ''}`}
              >
                👍
                <span className="block text-green-600 text-lg mt-1" style={{ fontFamily: '"Fredoka One", cursive' }}>
                  {thumbsUp}
                </span>
              </button>

              <button
                onClick={() => { setSelectedThumb('down'); handleRating('down') }}
                disabled={submitting}
                className={`flex-1 py-4 rounded-2xl text-4xl font-bold shadow-md transition-all duration-200 border-4 hover:scale-105 active:scale-95 ${
                  selectedThumb === 'down'
                    ? 'bg-red-100 border-red-400 scale-105'
                    : 'bg-white border-red-200 hover:bg-red-50 hover:border-red-300'
                } disabled:opacity-60 disabled:cursor-not-allowed ${animatingThumb === 'down' ? 'pop' : ''}`}
              >
                👎
                <span className="block text-red-600 text-lg mt-1" style={{ fontFamily: '"Fredoka One", cursive' }}>
                  {thumbsDown}
                </span>
              </button>
            </div>

            {/* Comment form */}
            <form onSubmit={handleSubmitComment} className="mt-4">
              <label className="block text-gray-700 font-bold mb-2">
                Leave a comment (optional) 💬
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What did you think? Would you recommend it?"
                rows={3}
                className="w-full px-4 py-3 rounded-2xl border-2 border-purple-200 focus:outline-none focus:border-purple-400 font-semibold text-gray-700 placeholder-gray-400 resize-none"
                style={{ fontFamily: 'Nunito, sans-serif' }}
              />
              {submitError && (
                <p className="text-red-500 font-bold text-sm mt-1">😬 {submitError}</p>
              )}
              <button
                type="submit"
                disabled={submitting || !comment.trim()}
                className="mt-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-6 py-2.5 rounded-full shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                {submitting ? '⏳ Sending...' : '💬 Post Comment'}
              </button>
            </form>
          </div>

          {/* Comments list */}
          {comments.length > 0 && (
            <div className="mt-8 border-t-2 border-purple-100 pt-6">
              <h2
                className="text-2xl text-purple-700 mb-4"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                Comments ({comments.length}) 💬
              </h2>
              <div className="flex flex-col gap-3">
                {comments.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-2xl p-4 border-2 ${
                      c.thumbs === 'up'
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0">{c.thumbs === 'up' ? '👍' : '👎'}</span>
                      <div className="flex-1">
                        {c.comment && (
                          <p className="text-gray-700 font-semibold mb-1">{c.comment}</p>
                        )}
                        <p className="text-gray-400 text-xs">
                          {new Date(c.created_at).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
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
