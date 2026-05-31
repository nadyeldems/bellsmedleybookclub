const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method === 'POST') {
    try {
      const id = params.id;
      const body = await request.json();
      const { thumbs, comment } = body;

      if (!thumbs || !['up', 'down'].includes(thumbs)) {
        return new Response(JSON.stringify({ error: 'thumbs must be "up" or "down"' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Verify book exists
      const book = await env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(id).first();
      if (!book) {
        return new Response(JSON.stringify({ error: 'Book not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      await env.DB.prepare(`
        INSERT INTO ratings (book_id, thumbs, comment)
        VALUES (?, ?, ?)
      `).bind(id, thumbs, comment || null).run();

      // Return updated counts
      const counts = await env.DB.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN thumbs = 'up' THEN 1 ELSE 0 END), 0) AS thumbs_up,
          COALESCE(SUM(CASE WHEN thumbs = 'down' THEN 1 ELSE 0 END), 0) AS thumbs_down
        FROM ratings
        WHERE book_id = ?
      `).bind(id).first();

      return new Response(JSON.stringify(counts), {
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
