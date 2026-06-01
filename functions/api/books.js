const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(`
        SELECT
          b.*,
          COALESCE(SUM(CASE WHEN r.thumbs = 'up' THEN 1 ELSE 0 END), 0)   AS thumbs_up,
          COALESCE(SUM(CASE WHEN r.thumbs = 'down' THEN 1 ELSE 0 END), 0) AS thumbs_down,
          ROUND(AVG(CASE WHEN r.stars IS NOT NULL THEN r.stars END), 1)    AS avg_stars,
          COUNT(CASE WHEN r.stars IS NOT NULL THEN 1 END)                  AS star_count
        FROM books b
        LEFT JOIN ratings r ON b.id = r.book_id
        GROUP BY b.id
        ORDER BY b.created_at DESC
      `).all();

      return new Response(JSON.stringify(results), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { isbn, title: manualTitle, author: manualAuthor, cover_url: manualCoverUrl } = body;

      // ── MANUAL ENTRY (title provided directly) ──
      if (manualTitle) {
        const cleanIsbn = isbn ? isbn.replace(/[^0-9X]/gi, '') : null;

        // Check for duplicate ISBN if one was provided
        if (cleanIsbn) {
          const existing = await env.DB.prepare('SELECT * FROM books WHERE isbn = ?').bind(cleanIsbn).first();
          if (existing) {
            return new Response(JSON.stringify({ error: 'Book already exists', book: existing }), {
              status: 409,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            });
          }
        }

        const result = await env.DB.prepare(`
          INSERT INTO books (isbn, title, author, cover_url)
          VALUES (?, ?, ?, ?)
          RETURNING *
        `).bind(cleanIsbn, manualTitle.trim(), manualAuthor?.trim() || null, manualCoverUrl || null).first();

        return new Response(JSON.stringify(result), {
          status: 201,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // ── ISBN LOOKUP (existing behaviour) ──
      if (!isbn) {
        return new Response(JSON.stringify({ error: 'Either a title (manual entry) or an ISBN is required' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const cleanIsbn = isbn.replace(/[^0-9X]/gi, '');

      // Check if already exists
      const existing = await env.DB.prepare('SELECT * FROM books WHERE isbn = ?').bind(cleanIsbn).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'Book already exists', book: existing }), {
          status: 409,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // ── Helpers ────────────────────────────────────────────────────────────

      // Build the best available Google Books cover URL from a volumeId.
      // Using the publisher/content endpoint with a fife size param gives
      // much higher resolution than the default thumbnail.
      function gbCoverUrl(volumeId) {
        return `https://books.google.com/books/publisher/content/images/frontcover/${volumeId}?fife=w600-h900&source=gbs_api`;
      }

      // Open Library covers endpoint — returns a real image or a 1×1 gif.
      // We store the URL and let the frontend's onLoad/naturalWidth check
      // filter out the blank placeholder.
      function olCoverUrl(isbn) {
        return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      }

      // ── Try Google Books first (best for children's books) ─────────────────
      let title, author, cover_url, description, publisher, year;
      let foundBook = false;

      try {
        const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}&maxResults=1`;
        const gbRes = await fetch(gbUrl);
        const gbData = await gbRes.json();
        const gbVolume = gbData.items?.[0];
        const gbItem = gbVolume?.volumeInfo;

        if (gbItem) {
          // Build full title: prefer "Series: Subtitle" form when both present
          title = gbItem.title || null;
          if (gbItem.subtitle) {
            // Only append subtitle if it's not already part of the title
            if (!title?.toLowerCase().includes(gbItem.subtitle.toLowerCase())) {
              title = `${title}: ${gbItem.subtitle}`;
            }
          }

          author = gbItem.authors?.join(', ') || null;
          description = gbItem.description || null;
          publisher = gbItem.publisher || null;
          year = gbItem.publishedDate || null;

          // Cover: prefer the high-res publisher endpoint using volumeId,
          // fall back to thumbnail URL with edge/zoom fixes
          if (gbVolume.id) {
            cover_url = gbCoverUrl(gbVolume.id);
          } else {
            const rawCover = gbItem.imageLinks?.large || gbItem.imageLinks?.medium
              || gbItem.imageLinks?.thumbnail || gbItem.imageLinks?.smallThumbnail || null;
            cover_url = rawCover
              ? rawCover.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=0')
              : null;
          }

          // If Google Books has no cover at all, try Open Library covers directly
          if (!cover_url) {
            cover_url = olCoverUrl(cleanIsbn);
          }

          foundBook = true;
        }
      } catch (_) {
        // Google Books failed, will try Open Library data API
      }

      // ── Fall back to Open Library data API ─────────────────────────────────
      if (!foundBook) {
        try {
          const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`;
          const olRes = await fetch(olUrl);
          const olData = await olRes.json();
          const bookData = olData[`ISBN:${cleanIsbn}`];

          if (bookData) {
            title = bookData.title || null;
            author = bookData.authors?.map(a => a.name).join(', ') || null;
            // Prefer OL cover data, but also try the direct cover endpoint
            cover_url = bookData.cover?.large || bookData.cover?.medium
              || bookData.cover?.small || olCoverUrl(cleanIsbn);
            description = bookData.excerpts?.[0]?.text || bookData.notes || null;
            publisher = bookData.publishers?.map(p => p.name).join(', ') || null;
            year = bookData.publish_date || null;
            foundBook = true;
          }
        } catch (_) {}
      }

      // ── Last resort: Open Library covers-only (no metadata) ────────────────
      // Sometimes OL has a cover scan for an ISBN even with no data entry.
      // We can't verify without a HEAD request so we just store the URL and let
      // the frontend's blank-image detection handle it if it 404s.
      if (!foundBook) {
        return new Response(JSON.stringify({ error: 'Book not found. Please check the ISBN and try again.' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      title = title || 'Unknown Title';

      const result = await env.DB.prepare(`
        INSERT INTO books (isbn, title, author, cover_url, description, publisher, year)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(cleanIsbn, title, author, cover_url, description, publisher, year).first();

      return new Response(JSON.stringify(result), {
        status: 201,
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
