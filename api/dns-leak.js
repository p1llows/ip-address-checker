// Thin proxy for the bash.ws DNS-leak test service, which does not send CORS headers.
// action=id            -> { id }
// action=result&id=... -> { entries: [{ type, ip, org, country }] }
import { getQuery, rateLimited, sendJson } from './_http.js';

const BASE = 'https://bash.ws';
const ID = /^[0-9a-f]{8,32}$/;

async function get(path) {
  const res = await fetch(BASE + path, { signal: AbortSignal.timeout(6000), redirect: 'error' });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.text();
}

const str = (v, max = 120) => (typeof v === 'string' ? v.slice(0, max) : null);

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (rateLimited(req, 30)) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { error: 'Too many requests. Please wait a minute.' });
  }
  const q = getQuery(req);
  try {
    if (q.get('action') === 'id') {
      const id = (await get('/id')).trim();
      if (!ID.test(id)) throw new Error('bad id');
      return sendJson(res, 200, { id });
    }
    if (q.get('action') === 'result') {
      const id = q.get('id') ?? '';
      if (!ID.test(id)) return sendJson(res, 400, { error: 'Invalid test id.' });
      const data = JSON.parse(await get(`/dnsleak/test/${id}?json`));
      if (!Array.isArray(data)) throw new Error('bad result');
      const entries = data
        .filter((e) => e && (e.type === 'dns' || e.type === 'ip' || e.type === 'conclusion'))
        .slice(0, 50)
        .map((e) => ({
          type: e.type,
          ip: str(e.ip, 64),
          org: str(e.org) ?? str(e.asn),
          country: str(e.country_name, 60),
        }));
      return sendJson(res, 200, { entries });
    }
    return sendJson(res, 400, { error: 'Unknown action.' });
  } catch {
    return sendJson(res, 502, { error: 'The DNS test service is unavailable.' });
  }
}
