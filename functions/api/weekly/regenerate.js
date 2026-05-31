const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (request.method === 'POST') {
    try {
      const weekOf = getISOWeek(new Date());

      // Delete existing picks for current week
      await env.DB.prepare('DELETE FROM weekly_picks WHERE week_of = ?').bind(weekOf).run();

      // Get all books and pick up to 7 randomly
      const { results: allBooks } = await env.DB.prepare('SELECT id FROM books ORDER BY RANDOM() LIMIT 7').all();

      if (allBooks.length === 0) {
        return new Response(JSON.stringify({ week_of: weekOf, books: [] }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Insert new picks
      const insertStmt = env.DB.prepare('INSERT OR IGNORE INTO weekly_picks (book_id, week_of) VALUES (?, ?)');
      const insertBatch = allBooks.map(b => insertStmt.bind(b.id, weekOf));
      await env.DB.batch(insertBatch);

      // Return the full book details
      const { results } = await env.DB.prepare(`
        SELECT
          b.*,
          COALESCE(SUM(CASE WHEN r.thumbs = 'up' THEN 1 ELSE 0 END), 0) AS thumbs_up,
          COALESCE(SUM(CASE WHEN r.thumbs = 'down' THEN 1 ELSE 0 END), 0) AS thumbs_down
        FROM weekly_picks wp
        JOIN books b ON wp.book_id = b.id
        LEFT JOIN ratings r ON b.id = r.book_id
        WHERE wp.week_of = ?
        GROUP BY b.id
        ORDER BY b.title
      `).bind(weekOf).all();

      return new Response(JSON.stringify({ week_of: weekOf, books: results }), {
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
