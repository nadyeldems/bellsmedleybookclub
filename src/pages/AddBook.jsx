import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'

export default function AddBook() {
  const [mode, setMode] = useState('scan') // 'scan' | 'manual'
  const [scannerState, setScannerState] = useState('idle') // idle | starting | scanning | success | error
  const [scannerError, setScannerError] = useState(null)
  const [isbn, setIsbn] = useState('')
  const [lookupState, setLookupState] = useState('idle') // idle | loading | done | error
  const [lookupError, setLookupError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [addedBook, setAddedBook] = useState(null)
  const html5QrCodeRef = useRef(null)
  const successTimeoutRef = useRef(null)

  const isScanning = ['starting', 'scanning', 'success'].includes(scannerState)

  const startScanner = async () => {
    setScannerState('starting')
    setScannerError(null)
    // Wait for the container to expand before initialising
    await new Promise(resolve => setTimeout(resolve, 120))
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const qrCode = new Html5Qrcode('qr-reader')
      html5QrCodeRef.current = qrCode
      await qrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 110 } },
        async (decodedText) => {
          const cleaned = decodedText.replace(/[^0-9X]/gi, '')
          // Stop immediately so we don't double-fire
          if (html5QrCodeRef.current) {
            try { await html5QrCodeRef.current.stop() } catch {}
            html5QrCodeRef.current = null
          }
          setScannerState('success')
          // Hold success overlay for 800ms then auto-lookup
          successTimeoutRef.current = setTimeout(() => {
            setScannerState('idle')
            lookupIsbn(cleaned)
          }, 800)
        },
        () => {} // per-frame errors — ignore
      )
      setScannerState('scanning')
    } catch (err) {
      setScannerError(
        err?.message?.includes('Permission')
          ? 'Camera permission denied. Please allow camera access and try again.'
          : 'Could not open camera — try entering the ISBN manually instead.'
      )
      setScannerState('error')
    }
  }

  const stopScanner = async () => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current)
    if (html5QrCodeRef.current) {
      try { await html5QrCodeRef.current.stop() } catch {}
      html5QrCodeRef.current = null
    }
    setScannerState('idle')
  }

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) html5QrCodeRef.current.stop().catch(() => {})
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current)
    }
  }, [])

  const lookupIsbn = async (isbnOverride) => {
    const cleanIsbn = (isbnOverride ?? isbn).replace(/[^0-9X]/gi, '')
    if (!cleanIsbn) { setLookupError('Please enter an ISBN'); return }
    setLookupState('loading')
    setLookupError(null)
    setPreview(null)
    setAddError(null)
    try {
      const res = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`
      )
      const data = await res.json()
      const bookData = data[`ISBN:${cleanIsbn}`]
      if (!bookData) {
        setLookupError("No book found with that ISBN — double-check and try again.")
        setLookupState('error')
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
      setLookupState('done')
    } catch {
      setLookupError('Could not look up that ISBN. Check your connection and try again.')
      setLookupState('error')
    }
  }

  const resetPreview = () => {
    setPreview(null)
    setIsbn('')
    setLookupState('idle')
    setLookupError(null)
    setAddError(null)
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
      if (res.status === 409) { setAddError('This book is already in the library!'); return }
      if (!res.ok) throw new Error(data.error || 'Failed to add book')
      setAddedBook(data)
      resetPreview()
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  if (addedBook) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bounce-in bg-green-50 border-4 border-green-400 rounded-3xl p-8 text-center shadow-lg">
          <div className="text-6xl mb-3">🎉</div>
          <h2 className="text-3xl text-green-700 mb-2" style={{ fontFamily: '"Fredoka One", cursive' }}>
            Book Added!
          </h2>
          <p className="text-gray-700 font-bold text-lg mb-6">"{addedBook.title}" is now in the library!</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to={`/books/${addedBook.id}`}
              className="bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold px-6 py-3 rounded-full shadow-md hover:scale-105 transition-all duration-200 text-lg"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              👀 View Book
            </Link>
            <button
              onClick={() => setAddedBook(null)}
              className="bg-gradient-to-r from-orange-400 to-yellow-400 text-white font-bold px-6 py-3 rounded-full shadow-md hover:scale-105 transition-all duration-200 text-lg"
              style={{ fontFamily: '"Fredoka One", cursive' }}
            >
              ➕ Add Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 rounded-3xl p-6 mb-6 shadow-xl text-center">
        <div className="text-4xl mb-1">➕</div>
        <h1 className="text-white text-4xl drop-shadow" style={{ fontFamily: '"Fredoka One", cursive' }}>
          Add a New Book!
        </h1>
      </div>

      <div className="bg-white rounded-3xl border-4 border-yellow-300 shadow-lg overflow-hidden">

        {/* Tab switcher */}
        <div className="flex border-b-4 border-yellow-200">
          <button
            onClick={() => { setMode('scan'); if (!isScanning) setScannerState('idle') }}
            className={`flex-1 py-3.5 font-bold text-base transition-colors ${
              mode === 'scan'
                ? 'bg-yellow-50 text-orange-600 border-b-4 border-orange-400 -mb-1'
                : 'text-gray-400 hover:bg-yellow-50/50'
            }`}
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            📷 Scan Barcode
          </button>
          <button
            onClick={() => { setMode('manual'); stopScanner() }}
            className={`flex-1 py-3.5 font-bold text-base transition-colors ${
              mode === 'manual'
                ? 'bg-purple-50 text-purple-600 border-b-4 border-purple-400 -mb-1'
                : 'text-gray-400 hover:bg-purple-50/50'
            }`}
            style={{ fontFamily: '"Fredoka One", cursive' }}
          >
            ⌨️ Type ISBN
          </button>
        </div>

        <div className="p-5">
          {/* ── SCAN MODE ── */}
          {mode === 'scan' && (
            <div>
              {/* Camera container — fixed height, always in DOM, smooth expand */}
              <div
                className="relative rounded-2xl overflow-hidden bg-gray-900 transition-all duration-300 ease-in-out"
                style={{ height: isScanning ? '280px' : '0px', marginBottom: isScanning ? '12px' : '0px' }}
              >
                {/* html5-qrcode mounts here */}
                <div id="qr-reader" className="w-full h-full" />

                {/* Starting overlay */}
                {scannerState === 'starting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-3 z-10">
                    <div className="w-10 h-10 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
                    <p className="text-yellow-300 font-bold text-lg" style={{ fontFamily: '"Fredoka One", cursive' }}>
                      Starting camera…
                    </p>
                  </div>
                )}

                {/* Scanning overlay — corner guides + animated line */}
                {scannerState === 'scanning' && (
                  <div className="absolute inset-0 pointer-events-none z-10">
                    {/* Dark vignette edges */}
                    <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/30" />
                    {/* Target box */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative" style={{ width: 240, height: 110 }}>
                        <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-yellow-400 rounded-tl" />
                        <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-yellow-400 rounded-tr" />
                        <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-yellow-400 rounded-bl" />
                        <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-yellow-400 rounded-br" />
                        <div className="animate-scan-line" />
                      </div>
                    </div>
                    {/* Hint text */}
                    <p className="absolute bottom-3 inset-x-0 text-center text-white/80 text-sm font-bold">
                      Point at the barcode on the back of the book
                    </p>
                  </div>
                )}

                {/* Success overlay */}
                {scannerState === 'success' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-500/95 gap-2 z-20">
                    <div className="text-6xl">✅</div>
                    <p className="text-white text-2xl font-bold" style={{ fontFamily: '"Fredoka One", cursive' }}>
                      Barcode scanned!
                    </p>
                    <p className="text-white/80 text-sm font-semibold">Looking up your book…</p>
                  </div>
                )}
              </div>

              {/* Error */}
              {scannerState === 'error' && scannerError && (
                <div className="bg-red-50 border-2 border-red-200 text-red-600 font-bold rounded-2xl p-3 mb-3 text-sm text-center">
                  {scannerError}
                </div>
              )}

              {/* Main action button */}
              {!isScanning ? (
                <button
                  onClick={startScanner}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold py-4 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 active:scale-95 transition-all duration-150 text-xl"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  📷 Scan a Barcode
                </button>
              ) : (
                <button
                  onClick={stopScanner}
                  disabled={scannerState === 'success'}
                  className="w-full bg-gray-100 text-gray-500 font-bold py-2.5 rounded-2xl hover:bg-gray-200 transition-colors text-sm disabled:opacity-0 disabled:pointer-events-none"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  ✕ Cancel
                </button>
              )}
            </div>
          )}

          {/* ── MANUAL MODE ── */}
          {mode === 'manual' && (
            <form onSubmit={(e) => { e.preventDefault(); lookupIsbn() }} className="flex flex-col gap-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={isbn}
                  onChange={(e) => setIsbn(e.target.value)}
                  placeholder="e.g. 9780747532743"
                  autoFocus
                  className="flex-1 px-4 py-3 rounded-2xl border-2 border-purple-200 focus:outline-none focus:border-purple-400 font-bold text-gray-700 placeholder-gray-400 text-base"
                  style={{ fontFamily: 'Nunito, sans-serif' }}
                />
                <button
                  type="submit"
                  disabled={lookupState === 'loading' || !isbn.trim()}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold px-4 py-3 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  style={{ fontFamily: '"Fredoka One", cursive' }}
                >
                  {lookupState === 'loading' ? '⏳' : '🔍 Look Up'}
                </button>
              </div>
              {lookupError && <p className="text-red-500 font-bold text-sm">😬 {lookupError}</p>}
            </form>
          )}
        </div>

        {/* ── LOOKUP LOADING (shown below tabs regardless of mode) ── */}
        {lookupState === 'loading' && (
          <div className="px-5 pb-5">
            <div className="flex items-center justify-center gap-3 bg-purple-50 rounded-2xl p-4 border-2 border-purple-100">
              <div className="w-6 h-6 border-4 border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <p className="text-purple-600 font-bold" style={{ fontFamily: '"Fredoka One", cursive' }}>
                Finding your book…
              </p>
            </div>
          </div>
        )}

        {/* ── LOOKUP ERROR ── */}
        {lookupState === 'error' && lookupError && mode === 'scan' && (
          <div className="px-5 pb-5">
            <p className="text-red-500 font-bold text-sm text-center">😬 {lookupError}</p>
          </div>
        )}

        {/* ── BOOK PREVIEW ── */}
        {preview && lookupState === 'done' && (
          <div className="bounce-in border-t-4 border-green-200 bg-green-50 p-5">
            <p className="text-green-600 font-bold text-lg mb-3" style={{ fontFamily: '"Fredoka One", cursive' }}>
              📖 Found it!
            </p>
            <div className="flex gap-4 mb-4">
              {preview.cover_url && (
                <img
                  src={preview.cover_url}
                  alt={preview.title}
                  className="w-20 aspect-[2/3] object-cover rounded-xl shadow-md border-2 border-white ring-2 ring-green-200 flex-shrink-0"
                  onLoad={(e) => { if (e.currentTarget.naturalWidth <= 1) e.currentTarget.style.display = 'none' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-gray-800 font-bold text-lg leading-tight mb-1" style={{ fontFamily: '"Fredoka One", cursive' }}>
                  {preview.title}
                </p>
                {preview.author && <p className="text-gray-600 text-sm font-semibold mb-0.5">✍️ {preview.author}</p>}
                {preview.publisher && <p className="text-gray-500 text-xs">🏢 {preview.publisher}</p>}
                {preview.year && <p className="text-gray-500 text-xs">📅 {preview.year}</p>}
              </div>
            </div>
            {addError && <p className="text-red-500 font-bold text-sm mb-3">😬 {addError}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                disabled={adding}
                className="flex-1 bg-gradient-to-r from-green-500 to-teal-500 text-white font-bold py-3 rounded-2xl shadow-md hover:shadow-lg hover:scale-105 transition-all duration-200 disabled:opacity-50 text-lg"
                style={{ fontFamily: '"Fredoka One", cursive' }}
              >
                {adding ? '⏳ Adding…' : '✅ Add to Library!'}
              </button>
              <button
                onClick={resetPreview}
                className="bg-white border-2 border-gray-200 text-gray-500 font-bold px-4 py-3 rounded-2xl hover:bg-gray-50 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
