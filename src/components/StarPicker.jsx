import { useState } from 'react'

export default function StarPicker({ value = 0, onChange, size = 'lg', readonly = false }) {
  const [hovered, setHovered] = useState(0)
  const active = hovered || value

  const sizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
  }

  return (
    <div
      className={`flex gap-1 ${readonly ? '' : 'cursor-pointer'}`}
      onMouseLeave={() => !readonly && setHovered(0)}
      aria-label={`Star rating: ${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(n)}
          onMouseEnter={() => !readonly && setHovered(n)}
          className={`
            leading-none transition-all duration-100 select-none
            ${sizes[size]}
            ${readonly ? 'cursor-default' : 'hover:scale-125 active:scale-110'}
            ${n <= active ? 'drop-shadow-sm' : ''}
          `}
          style={{
            color: n <= active ? '#FBBF24' : '#E5E7EB',
            filter: n <= active && !readonly ? 'drop-shadow(0 0 4px rgba(251,191,36,0.6))' : 'none',
            background: 'none',
            border: 'none',
            padding: 0,
          }}
          aria-label={`${n} star${n !== 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}
