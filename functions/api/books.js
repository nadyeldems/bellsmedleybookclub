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
      const apiKey = env.GOOGLE_BOOKS_API_KEY || null;

      function gbCoverFromId(volumeId) {
        return `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=0&source=gbs_api`;
      }
      function gbCoverFromThumb(thumb) {
        return thumb.replace(/^http:/, 'https:').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=0');
      }
      function olCoverById(id) {
        return `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
      }
      function olCoverByIsbn(isbn) {
        return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
      }

      // ── 1. Google Books ─────────────────────────────────────────────────
      let title, author, cover_url, description, publisher, year;
      let foundBook = false;

      try {
        const keyParam = apiKey ? `&key=${apiKey}` : '';
        const gbRes = await fetch(
          `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}&maxResults=1${keyParam}`
        );
        const gbData = await gbRes.json();
        const gbVolume = gbData.items?.[0];
        const gbItem = gbVolume?.volumeInfo;

        if (gbItem && !gbData.error) {
          title = gbItem.title || null;
          if (gbItem.subtitle && !title?.toLowerCase().includes(gbItem.subtitle.toLowerCase())) {
            title = `${title}: ${gbItem.subtitle}`;
          }
          author = gbItem.authors?.join(', ') || null;
          description = gbItem.description || null;
          publisher = gbItem.publisher || null;
          year = gbItem.publishedDate || null;

          // Only use GB cover URL when imageLinks are confirmed — the content
          // endpoint returns an "image not available" placeholder (not a 404)
          // when there's no cover, which we can't easily detect client-side.
          const rawThumb = gbItem.imageLinks?.large || gbItem.imageLinks?.medium
            || gbItem.imageLinks?.thumbnail || gbItem.imageLinks?.smallThumbnail || null;
          if (rawThumb) {
            cover_url = gbCoverFromThumb(rawThumb);
          } else if (gbVolume.id && gbItem.imageLinks) {
            cover_url = gbCoverFromId(gbVolume.id);
          }
          // No imageLinks → leave cover_url null, OL will fill it below

          foundBook = true;
        }
      } catch (_) {}

      // ── 2. Open Library Search API (better cover IDs + richer metadata) ──
      try {
        const olSearchRes = await fetch(
          `https://openlibrary.org/search.json?isbn=${cleanIsbn}&fields=title,subtitle,author_name,cover_i,publisher,first_publish_year&limit=1`
        );
        const olSearch = await olSearchRes.json();
        const doc = olSearch.docs?.[0];

        if (doc) {
          let olTitle = doc.title || null;
          if (doc.subtitle && !olTitle?.toLowerCase().includes(doc.subtitle.toLowerCase())) {
            olTitle = `${olTitle}: ${doc.subtitle}`;
          }
          if (!title && olTitle) { title = olTitle; foundBook = true; }
          if (!author) author = doc.author_name?.join(', ') || null;
          if (!publisher) publisher = Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher || null;
          if (!year && doc.first_publish_year) year = String(doc.first_publish_year);
          // OL cover by ID is often higher quality than GB thumbnail
          if (!cover_url && doc.cover_i) cover_url = olCoverById(doc.cover_i);
          if (doc.cover_i && cover_url && !cover_url.includes('covers.openlibrary.org')) {
            // Prefer OL cover ID over GB URL when available — generally sharper
            // (comment out this line to always prefer GB)
            // cover_url = olCoverById(doc.cover_i);
          }
        }
      } catch (_) {}

      // ── 3. Open Library Data API fallback ─────────────────────────────────
      if (!foundBook) {
        try {
          const olRes = await fetch(
            `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`
          );
          const olData = await olRes.json();
          const bookData = olData[`ISBN:${cleanIsbn}`];
          if (bookData) {
            title = title || bookData.title || null;
            author = author || bookData.authors?.map(a => a.name).join(', ') || null;
            cover_url = cover_url || bookData.cover?.large || bookData.cover?.medium
              || bookData.cover?.small || null;
            description = description || bookData.excerpts?.[0]?.text || bookData.notes || null;
            publisher = publisher || bookData.publishers?.map(p => p.name).join(', ') || null;
            year = year || bookData.publish_date || null;
            foundBook = true;
          }
        } catch (_) {}
      }

      // ── Last resort OL cover by ISBN ───────────────────────────────────────
      if (foundBook && !cover_url) cover_url = olCoverByIsbn(cleanIsbn);

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
