const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Re-fetch metadata from Google Books (primary) then Open Library (fallback).
// Returns { title, author, cover_url, description, publisher, year } or null.
async function fetchBookMetadata(isbn) {
  function gbCoverUrl(volumeId) {
    return `https://books.google.com/books/publisher/content/images/frontcover/${volumeId}?fife=w600-h900&source=gbs_api`;
  }
  function olCoverUrl(isbn) {
    return `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
  }

  // Google Books
  try {
    const gbRes = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`);
    const gbData = await gbRes.json();
    const gbVolume = gbData.items?.[0];
    const gbItem = gbVolume?.volumeInfo;
    if (gbItem) {
      let title = gbItem.title || null;
      if (gbItem.subtitle && !title?.toLowerCase().includes(gbItem.subtitle.toLowerCase())) {
        title = `${title}: ${gbItem.subtitle}`;
      }
      let cover_url = gbVolume.id ? gbCoverUrl(gbVolume.id) : null;
      if (!cover_url) {
        const raw = gbItem.imageLinks?.large || gbItem.imageLinks?.medium
          || gbItem.imageLinks?.thumbnail || gbItem.imageLinks?.smallThumbnail || null;
        cover_url = raw
          ? raw.replace(/^http:/, 'https:').replace('&edge=curl', '').replace('zoom=1', 'zoom=0')
          : olCoverUrl(isbn);
      }
      return {
        title,
        author: gbItem.authors?.join(', ') || null,
        cover_url,
        description: gbItem.description || null,
        publisher: gbItem.publisher || null,
        year: gbItem.publishedDate || null,
      };
    }
  } catch (_) {}

  // Open Library fallback
  try {
    const olRes = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`);
    const olData = await olRes.json();
    const bookData = olData[`ISBN:${isbn}`];
    if (bookData) {
      return {
        title: bookData.title || null,
        author: bookData.authors?.map(a => a.name).join(', ') || null,
        cover_url: bookData.cover?.large || bookData.cover?.medium || bookData.cover?.small || olCoverUrl(isbn),
        description: bookData.excerpts?.[0]?.text || bookData.notes || null,
        publisher: bookData.publishers?.map(p => p.name).join(', ') || null,
        year: bookData.publish_date || null,
      };
    }
  } catch (_) {}

  return null;
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

      const meta = await fetchBookMetadata(book.isbn);
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
        meta.author,
        meta.cover_url,
        meta.description,
        meta.publisher,
        meta.year,
        id,
      ).first();

      return new Response(JSON.stringify(updated), {
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
