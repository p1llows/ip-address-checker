// Small helpers shared by the API functions (Node-style handlers, no framework helpers).

const hits = new Map();
const WINDOW_MS = 60_000;

/**
 * Best-effort in-memory rate limit. Serverless instances do not share memory, so this only
 * slows abuse; use Vercel Firewall / a shared store (e.g. Upstash) for a hard limit.
 */
export function rateLimited(req, limit = 20) {
  const ip =
    String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return recent.length > limit;
}

export function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

export function getQuery(req) {
  return new URL(req.url ?? '/', 'http://localhost').searchParams;
}
