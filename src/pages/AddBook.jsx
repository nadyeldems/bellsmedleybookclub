import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export default function AddBook() {
  const [isbn, setIsbn] = useState('')
  const [preview, setPreview] = useState(null)
  const [lookingUp, setLookingUp] = useState(false)
  const [adding, setAdding] = useState(false)
  const [lookupError, setLookupError] = useState(null)
  const [addError, setAddError] = useState(null)
  const [addedBook, setAddedBook] = useState(null)
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerError, setScannerError] = useState(null)
  const scannerRef = useRef(null)
  const html5QrCodeRef = useRef(null)

  const startScanner = async () => {
    setScannerError(null)
    setScannerActive(true)
    // Small delay so the #qr-reader div is in the DOM
    await new Promise(resolve => setTimeout(resolve, 50))
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const qrCode = new Html5Qrcode('qr-reader')
      html5QrCodeRef.current = qrCode
      await qrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 120 } },
        (decodedText) => {
          const cleaned = decodedText.replace(/[^0-9X]/gi, '')
          setIsbn(cleaned)
          stopScanner()
        },
        () => {}
      )
    } catch (err) {
      setScannerError('Could not open camera: ' + (err?.message || err?.toString() || 'permission denied or camera unavailable'))
      setScannerActive(false)
      html5QrCodeRef.current = null
    }
  }

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop()
        html5QrCodeRef.current.clear()
      } catch {}
      html5QrCodeRef.current = null
    }
    setScannerActive(false)
  }

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {})
      }
    }
  }, [])

  const handleLookup = async (e) => {
    e.preventDefault()
    const cleanIsbn = isbn.replace(/[^0-9X]/gi, '')
    if (!cleanIsbn) {
      setLookupError('Please enter an ISBN')
      return
    }
    try {
      setLookingUp(true)
      setLookupError(null)
      setPreview(null)
      setAddError(null)
      setAddedBook(null)

      // Preview from Open Library directly (no DB yet)
      const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`
      const res = await fetch(olUrl)
      const data = await res.json()
      const bookData = data[`ISBN:${cleanIsbn}`]

      if (!bookData) {
        setLookupError('No book found with that ISBN. Try a different one!')
        return
      }

      setPreview({
        isbn: cleanIsbn,
        title: bookData.title || 'Unknown Title',
        author: bookData.authors?.map(a => a.name).join(', ') || null,
        cover_url: bookData.cover?.large || bookData.cover?.medium || bookData.cover?.small || null,
        publisher: bookData.publishers?.map(p => p.name).join(', ') || null,
        year: bookData.publish_date || null,
      })
    } catch (err) {
      setLookupError('Could not look up that ISBN. Check your connection and try again.')
    } finally {
      setLookingUp(false)
    }
  }

  const handleAdd = async () => {
    if (!preview) return
    try {
      setAdding(true)
      setAddError(null)
      const res = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isbn: preview.isbn }),
      })
      const data = await res.json()
      if (res.status === 409) {
        setAddError('This book is already in the library!')
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to add book')
      setAddedBook(data)
      setPreview(null)
      setIsbn('')
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 rounded-3xl p-6 mb-8 shadow-xl text-center">
        <div className="text-4xl mb-2">➕</div>
        <h1
          className="text-white text-4xl drop-shadow"
          style={{ fontFamily: '"Fredoka One", cursive' }}
        >
          Add a New Book!
        </h1>
        <p className="text-white/80 font-semibold mt-1">
          Scan the barcode or type in the ISBN number
        </p>
      </div>

      {/* Success state */}
      {addedBook && (
        <div className="bounce-in bg-green-50 border-4 border-green-400 rounded-3xl p-6 mb-6 text-center shadow-lg">
          <div className="text-5xl mb-3">🎉</div>
          <h2
            className="text-2xl text-green-700 mb-2"
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            Book Added!
          </h2>
          <p className="text-gray-700 font-bold text-lg mb-4">"{addedBook.title}" is now in the library!</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/books/${addedBook.id}`}
              className="bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold px-6 py-2.5 rounded-full shadow-md hover:scale-105 transition-all duration-200"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              👀 View Book
            </Link>
            <button
              onClick={() => setAddedBook(null)}
              className="bg-gradient-to-r from-orange-400 to-yellow-400 text-white font-bold px-6 py-2.5 rounded-full shadow-md hover:scale-105 transition-all duration-200"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              ➕ Add Another
            </button>
          </div>
        </div>
      )}

      {!addedBook && (
        <>
          {/* Camera scanner section */}
          <div className="bg-white rounded-3xl border-4 border-yellow-300 shadow-lg p-6 mb-6">
            <h2
              className="text-2xl text-orange-600 mb-3"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              📷 Scan Barcode
            </h2>

            {scannerError && (
              <div className="bg-red-50 border-2 border-red-200 text-red-600 font-bold rounded-xl p-3 mb-3 text-sm">
                {scannerError}
              </div>
            )}

            {!scannerActive && (
              <button
                onClick={startScanner}
                className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold py-3 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 text-lg"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                📷 Open Camera Scanner
              </button>
            )}

            {scannerActive && (
              <div>
                <div id="qr-reader" className="rounded-2xl overflow-hidden" />
                <button
                  onClick={stopScanner}
                  className="mt-3 w-full bg-gray-200 text-gray-700 font-bold py-2.5 rounded-2xl hover:bg-gray-300 transition-colors"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  ✕ Close Scanner
                </button>
              </div>
            )}
          </div>

          {/* Manual entry section */}
          <div className="bg-white rounded-3xl border-4 border-purple-300 shadow-lg p-6 mb-6">
            <h2
              className="text-2xl text-purple-600 mb-3"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              ⌨️ Enter ISBN Manually
            </h2>

            <form onSubmit={handleLookup} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  placeholder="e.g. 9780747532743"
                  className="flex-1 px-4 py-3 rounded-2xl border-2 border-purple-200 focus:outline-none focus:border-purple-400 font-bold text-gray-700 placeholder-gray-400 text-base"
                  style={{ fontFamily: 'Nunito, sans-serif' }}
                />
                <button
                  type="submit"
                  disabled={lookingUp || !isbn.trim()}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-4 py-3 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  {lookingUp ? '⏳' : '🔍 Look Up'}
                </button>
              </div>

              {lookupError && (
                <p className="text-red-500 font-bold text-sm">😬 {lookupError}</p>
              )}
            </form>
          </div>

          {/* Preview */}
          {preview && (
            <div className="bounce-in bg-white rounded-3xl border-4 border-green-300 shadow-lg p-6">
              <h2
                className="text-2xl text-green-600 mb-4"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                📖 Found It!
              </h2>

              <div className="flex gap-4">
                <div className="flex-shrink-0">
                  <img
                    src={preview.cover_url}
                    alt={`Cover of ${preview.title}`}
                    className="w-24 aspect-[2/3] object-cover rounded-xl shadow border-2 border-white ring-2 ring-green-200"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
                <div className="flex-1">
                  <h3
                    className="text-xl text-gray-800 mb-1"
                    style={{ fontFamily: '"Fredoka One", cursive' }}
                  >
                    {preview.title}
                  </h3>
                  {preview.author && <p className="text-gray-600 font-bold text-sm mb-1">✍️ {preview.author}</p>}
                  {preview.publisher && <p className="text-gray-500 text-sm font-semibold">🏢 {preview.publisher}</p>}
                  {preview.year && <p className="text-gray-500 text-sm font-semibold">📅 {preview.year}</p>}
                </div>
              </div>

              {addError && (
                <p className="text-red-500 font-bold text-sm mt-3">😬 {addError}</p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="flex-1 bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold py-3 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  {adding ? '⏳ Adding...' : '✅ Add to Library!'}
                </button>
                <button
                  onClick={() => { setPreview(null); setIsbn('') }}
                  className="bg-gray-200 text-gray-700 font-bold px-4 py-3 rounded-2xl hover:bg-gray-300 transition-colors"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
