import { checkWebsite } from './_check.js';
import { BlockedError } from './_ssrf.js';
import { getQuery, rateLimited, sendJson } from './_http.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed.' });
  if (rateLimited(req)) {
    res.setHeader('Retry-After', '60');
    return sendJson(res, 429, { error: 'Too many checks. Please wait a minute and try again.' });
  }
  try {
    return sendJson(res, 200, await checkWebsite(getQuery(req).get('url')));
  } catch (e) {
    if (e instanceof BlockedError) {
      return sendJson(res, 400, { error: e.message });
    }
    // Validation errors carry user-safe messages; anything else is hidden.
    const safe = e instanceof Error && !e.code && e.constructor === Error;
    return sendJson(res, safe ? 400 : 500, {
      error: safe ? e.message : 'The check failed unexpectedly.',
    });
  }
}
