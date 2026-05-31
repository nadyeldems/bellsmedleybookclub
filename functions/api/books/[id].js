const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
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

      const book = await env.DB.prepare(`
        SELECT
          b.*,
          COALESCE(SUM(CASE WHEN r.thumbs = 'up' THEN 1 ELSE 0 END), 0) AS thumbs_up,
          COALESCE(SUM(CASE WHEN r.thumbs = 'down' THEN 1 ELSE 0 END), 0) AS thumbs_down
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
        SELECT id, thumbs, comment, created_at
        FROM ratings
        WHERE book_id = ?
        ORDER BY created_at DESC
      `).bind(id).all();

      return new Response(JSON.stringify({ ...book, comments }), {
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
