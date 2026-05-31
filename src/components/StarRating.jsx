// Simple thumbs ratio display used in some contexts
export default function StarRating({ thumbsUp = 0, thumbsDown = 0 }) {
  const total = thumbsUp + thumbsDown
  const percentage = total === 0 ? 0 : Math.round((thumbsUp / total) * 100)

  return (
    <div className="flex items-center gap-2">
      <span className="text-green-500 font-bold text-sm">👍 {thumbsUp}</span>
      {total > 0 && (
        <div className="flex-1 max-w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-500"
            style={{ width: `${percentage}%` }}
          />
        </div>
      )}
      <span className="text-red-500 font-bold text-sm">👎 {thumbsDown}</span>
    </div>
  )
}
