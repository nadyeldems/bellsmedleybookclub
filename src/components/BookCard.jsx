import { useNavigate } from 'react-router-dom'

const BORDER_COLORS = [
  'border-purple-400',
  'border-pink-400',
  'border-orange-400',
  'border-yellow-400',
  'border-green-400',
  'border-teal-400',
  'border-blue-400',
]

const BG_COLORS = [
  'bg-purple-50',
  'bg-pink-50',
  'bg-orange-50',
  'bg-yellow-50',
  'bg-green-50',
  'bg-teal-50',
  'bg-blue-50',
]

const PLACEHOLDER_COLORS = [
  'from-purple-300 to-pink-300',
  'from-pink-300 to-orange-300',
  'from-orange-300 to-yellow-300',
  'from-yellow-300 to-green-300',
  'from-green-300 to-teal-300',
  'from-teal-300 to-blue-300',
  'from-blue-300 to-purple-300',
]

export default function BookCard({ book, index = 0 }) {
  const navigate = useNavigate()
  const colorIdx = (book.id || index) % BORDER_COLORS.length
  const borderColor = BORDER_COLORS[colorIdx]
  const bgColor = BG_COLORS[colorIdx]
  const placeholderGradient = PLACEHOLDER_COLORS[colorIdx]

  return (
    <div
      className={`book-card cursor-pointer rounded-2xl border-4 ${borderColor} ${bgColor} shadow-md overflow-hidden flex flex-col`}
      onClick={() => navigate(`/books/${book.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/books/${book.id}`)}
    >
      {/* Cover image */}
      <div className="relative w-full aspect-[2/3] bg-white overflow-hidden">
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={`Cover of ${book.title}`}
            className="w-full h-full object-cover"
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth <= 1) {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextSibling.style.display = 'flex'
              }
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              e.currentTarget.nextSibling.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${placeholderGradient} flex items-center justify-center`}
          style={{ display: book.cover_url ? 'none' : 'flex' }}
        >
          <span className="text-6xl">📖</span>
        </div>
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col gap-1 flex-1">
        <h3
          className="text-gray-800 leading-tight line-clamp-2 text-base"
          style={{ fontFamily: '"Fredoka One", cursive' }}
        >
          {book.title}
        </h3>
        {book.author && (
          <p className="text-gray-500 text-xs font-semibold truncate">{book.author}</p>
        )}

        {/* Ratings */}
        <div className="flex flex-col gap-1 mt-auto pt-2">
          {/* Star rating */}
          {book.avg_stars ? (
            <div className="flex items-center gap-1">
              <span className="text-yellow-400 text-sm leading-none">{'★'.repeat(Math.round(book.avg_stars))}{'☆'.repeat(5 - Math.round(book.avg_stars))}</span>
              <span className="text-gray-500 text-xs font-bold">{book.avg_stars}</span>
            </div>
          ) : null}
          {/* Thumbs badges */}
          <div className="flex gap-1.5">
            <span className="inline-flex items-center gap-0.5 bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded-full border border-green-300">
              👍 {book.thumbs_up ?? 0}
            </span>
            <span className="inline-flex items-center gap-0.5 bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full border border-red-300">
              👎 {book.thumbs_down ?? 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
