const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const id = params.id;

  // GET — list all reads for this book
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(`
        SELECT id, read_at, created_at
        FROM read_log
        WHERE book_id = ?
        ORDER BY read_at DESC
      `).bind(id).all();

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

  // POST — log a new read
  if (request.method === 'POST') {
    try {
      const book = await env.DB.prepare('SELECT id FROM books WHERE id = ?').bind(id).first();
      if (!book) {
        return new Response(JSON.stringify({ error: 'Book not found' }), {
          status: 404,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const body = await request.json().catch(() => ({}));
      // read_at defaults to now if not provided; client sends ISO string
      const readAt = body.read_at || new Date().toISOString().replace('T', ' ').slice(0, 19);

      const entry = await env.DB.prepare(`
        INSERT INTO read_log (book_id, read_at)
        VALUES (?, ?)
        RETURNING *
      `).bind(id, readAt).first();

      return new Response(JSON.stringify(entry), {
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
