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
      const { isbn } = body;

      if (!isbn) {
        return new Response(JSON.stringify({ error: 'ISBN is required' }), {
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

      // Fetch from Open Library
      const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&jscmd=data&format=json`;
      const olRes = await fetch(olUrl);
      const olData = await olRes.json();
      const bookData = olData[`ISBN:${cleanIsbn}`];

      if (!bookData) {
        return new Response(JSON.stringify({ error: 'Book not found in Open Library' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const title = bookData.title || 'Unknown Title';
      const author = bookData.authors?.map(a => a.name).join(', ') || null;
      const cover_url = bookData.cover?.large || bookData.cover?.medium || bookData.cover?.small || null;
      const description = bookData.excerpts?.[0]?.text || bookData.notes || null;
      const publisher = bookData.publishers?.map(p => p.name).join(', ') || null;
      const year = bookData.publish_date || null;

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
