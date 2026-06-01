const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ── Book metadata lookup ────────────────────────────────────────────────────
// Tries three sources in order, merges the best available data.
// apiKey is optional — if provided it avoids the shared anonymous GB quota.
async function fetchBookMetadata(isbn, apiKey) {

  // Public Google Books cover URL (books/content endpoint — genuinely public)
  function gbCoverFromId(volumeId) {
    return `https://books.google.com/books/content?id=${volumeId}&printsec=frontcover&img=1&zoom=0&source=gbs_api`;
  }
  function gbCoverFromThumb(thumb) {
    return thumb.replace(/^http:/, 'https:').replace('&edge=curl', '').replace(/zoom=\d/, 'zoom=0');
  }
  // Open Library cover by cover ID (highest quality OL source)
  function olCoverById(id) {
    return `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
  }
  // Open Library cover by ISBN (direct fallback — returns 1×1 gif if missing)
  function olCoverByIsbn(isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  }

  let result = {};

  // ── 1. Google Books ─────────────────────────────────────────────────────
  try {
    const keyParam = apiKey ? `&key=${apiKey}` : '';
    const gbRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1${keyParam}`
    );
    const gbData = await gbRes.json();
    const gbVolume = gbData.items?.[0];
    const gbItem = gbVolume?.volumeInfo;

    if (gbItem && !gbData.error) {
      let title = gbItem.title || null;
      if (gbItem.subtitle && !title?.toLowerCase().includes(gbItem.subtitle.toLowerCase())) {
        title = `${title}: ${gbItem.subtitle}`;
      }

      // Only use GB cover when imageLinks are confirmed — the content endpoint
      // returns an "image not available" placeholder (not a 404) when no cover
      // exists, which can't be reliably detected client-side.
      const rawThumb = gbItem.imageLinks?.large || gbItem.imageLinks?.medium
        || gbItem.imageLinks?.thumbnail || gbItem.imageLinks?.smallThumbnail || null;
      let cover_url = rawThumb ? gbCoverFromThumb(rawThumb)
        : (gbVolume.id && gbItem.imageLinks ? gbCoverFromId(gbVolume.id) : null);

      result = {
        title,
        author: gbItem.authors?.join(', ') || null,
        cover_url,
        description: gbItem.description || null,
        publisher: gbItem.publisher || null,
        year: gbItem.publishedDate || null,
        _source: 'google',
      };
    }
  } catch (_) {}

  // ── 2. Open Library Search API ──────────────────────────────────────────
  // Often has better cover IDs and richer metadata for children's books
  try {
    const olSearchRes = await fetch(
      `https://openlibrary.org/search.json?isbn=${isbn}&fields=title,subtitle,author_name,cover_i,publisher,first_publish_year&limit=1`
    );
    const olSearch = await olSearchRes.json();
    const doc = olSearch.docs?.[0];

    if (doc) {
      // Build full title
      let olTitle = doc.title || null;
      if (doc.subtitle && !olTitle?.toLowerCase().includes(doc.subtitle.toLowerCase())) {
        olTitle = `${olTitle}: ${doc.subtitle}`;
      }
      const olAuthor = doc.author_name?.join(', ') || null;
      const olCover = doc.cover_i ? olCoverById(doc.cover_i) : null;
      const olPublisher = Array.isArray(doc.publisher) ? doc.publisher[0] : doc.publisher || null;
      const olYear = doc.first_publish_year ? String(doc.first_publish_year) : null;

      // Merge: use OL data to fill gaps, but prefer GB if we already have it
      if (!result.title && olTitle) result.title = olTitle;
      if (!result.author && olAuthor) result.author = olAuthor;
      if (!result.publisher && olPublisher) result.publisher = olPublisher;
      if (!result.year && olYear) result.year = olYear;
      // OL cover IDs are often higher quality — use if we don't have a GB cover
      // or if GB quota was exceeded (no result at all yet)
      if (olCover && (!result.cover_url || !result._source)) result.cover_url = olCover;
      if (!result._source) result._source = 'openlibrary-search';
    }
  } catch (_) {}

  // ── 3. Open Library Data API ────────────────────────────────────────────
  if (!result.title) {
    try {
      const olRes = await fetch(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`
      );
      const olData = await olRes.json();
      const bookData = olData[`ISBN:${isbn}`];
      if (bookData) {
        result.title = result.title || bookData.title || null;
        result.author = result.author || bookData.authors?.map(a => a.name).join(', ') || null;
        result.cover_url = result.cover_url
          || bookData.cover?.large || bookData.cover?.medium || bookData.cover?.small
          || olCoverByIsbn(isbn);
        result.description = result.description || bookData.excerpts?.[0]?.text || bookData.notes || null;
        result.publisher = result.publisher || bookData.publishers?.map(p => p.name).join(', ') || null;
        result.year = result.year || bookData.publish_date || null;
        if (!result._source) result._source = 'openlibrary-data';
      }
    } catch (_) {}
  }

  // ── 4. Last-resort: OL cover by ISBN (no metadata) ─────────────────────
  if (result.title && !result.cover_url) {
    result.cover_url = olCoverByIsbn(isbn);
  }

  return result.title ? result : null;
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === 'GET') {
    try {
      const id = params.id;

      const book = await env.DB.prepare(`
        SELECT
          b.*,
          COALESCE(SUM(CASE WHEN r.thumbs = 'up' THEN 1 ELSE 0 END), 0)   AS thumbs_up,
          COALESCE(SUM(CASE WHEN r.thumbs = 'down' THEN 1 ELSE 0 END), 0) AS thumbs_down,
          ROUND(AVG(CASE WHEN r.stars IS NOT NULL THEN r.stars END), 1)    AS avg_stars,
          COUNT(CASE WHEN r.stars IS NOT NULL THEN 1 END)                  AS star_count
        FROM books b
        LEFT JOIN ratings r ON b.id = r.book_id
        WHERE b.id = ?
        GROUP BY b.id
      `).bind(id).first();

      if (!book) {
        return new Response(JSON.stringify({ error: 'Book not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const { results: comments } = await env.DB.prepare(`
        SELECT id, thumbs, stars, comment, created_at
        FROM ratings
        WHERE book_id = ? AND (comment IS NOT NULL OR thumbs IS NOT NULL)
        ORDER BY created_at DESC
      `).bind(id).all();

      const { results: reads } = await env.DB.prepare(`
        SELECT id, read_at, created_at
        FROM read_log
        WHERE book_id = ?
        ORDER BY read_at DESC
      `).bind(id).all();

      return new Response(JSON.stringify({ ...book, comments, reads }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── PATCH: refresh metadata from APIs ──────────────────────────────────────
  if (request.method === 'PATCH') {
    try {
      const id = params.id;
      const book = await env.DB.prepare('SELECT id, isbn FROM books WHERE id = ?').bind(id).first();
      if (!book) {
        return new Response(JSON.stringify({ error: 'Book not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      if (!book.isbn) {
        return new Response(JSON.stringify({ error: 'No ISBN — cannot refresh metadata for manually added books' }), {
          status: 422,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const meta = await fetchBookMetadata(book.isbn, env.GOOGLE_BOOKS_API_KEY || null);
      if (!meta) {
        return new Response(JSON.stringify({ error: 'Could not find updated metadata for this ISBN' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const updated = await env.DB.prepare(`
        UPDATE books
        SET title = ?, author = ?, cover_url = ?, description = ?, publisher = ?, year = ?
        WHERE id = ?
        RETURNING *
      `).bind(
        meta.title || 'Unknown Title',
        meta.author || null,
        meta.cover_url || null,
        meta.description || null,
        meta.publisher || null,
        meta.year || null,
        id,
      ).first();

      return new Response(JSON.stringify({ ...updated, _refreshSource: meta._source }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  }

  if (request.method === 'DELETE') {
    try {
      const id = params.id;
      const book = await env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(id).first();
      if (!book) {
        return new Response(JSON.stringify({ error: 'Book not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }
      await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), {
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
