const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === 'GET') {
    try {
      const id = params.id;
      const book = await env.DB.prepare('SELECT isbn FROM books WHERE id = ?').bind(id).first();

      if (!book?.isbn) {
        return new Response(JSON.stringify({ covers: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const isbn = book.isbn;
      const apiKey = env.GOOGLE_BOOKS_API_KEY || null;
      const covers = [];

      // ── Google Books ──────────────────────────────────────────────────────
      try {
        const keyParam = apiKey ? `&key=${apiKey}` : '';
        const gbRes = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=3${keyParam}`
        );
        const gbData = await gbRes.json();

        for (const vol of gbData.items || []) {
          const il = vol.volumeInfo?.imageLinks;
          if (!il) continue;
          const base = il.thumbnail || il.smallThumbnail;
          if (!base) continue;
          const clean = base.replace(/^http:/, 'https:').replace('&edge=curl', '');
          // Zoom 0 = largest available
          covers.push({
            source: 'Google Books',
            url: clean.replace(/zoom=\d/, 'zoom=0'),
          });
          // Also offer the medium/large variants if present
          if (il.medium) covers.push({ source: 'Google Books (HD)', url: il.medium.replace(/^http:/, 'https:') });
          if (il.large)  covers.push({ source: 'Google Books (Large)', url: il.large.replace(/^http:/, 'https:') });
        }
      } catch (_) {}

      // ── Open Library Search (cover by ID — highest quality) ───────────────
      try {
        const olSRes = await fetch(
          `https://openlibrary.org/search.json?isbn=${isbn}&fields=cover_i&limit=1`
        );
        const olS = await olSRes.json();
        const coverId = olS.docs?.[0]?.cover_i;
        if (coverId) {
          covers.push({ source: 'Open Library', url: `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` });
          covers.push({ source: 'Open Library (M)', url: `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` });
        }
      } catch (_) {}

      // ── Open Library by ISBN ───────────────────────────────────────────────
      covers.push({ source: 'Open Library (ISBN)', url: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` });

      return new Response(JSON.stringify({ covers }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS });
}
