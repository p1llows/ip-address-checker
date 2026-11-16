import http from 'node:http';
import https from 'node:https';
import { assertAllowedDestination, BlockedError, parseTarget, safeLookup } from './_ssrf.js';

const MAX_REDIRECTS = 5;
const TOTAL_TIMEOUT_MS = 8000;

function requestOnce(url, signal, lookup) {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup,
        signal,
        agent: false,
        headers: { 'user-agent': 'IPTools-WebsiteChecker/1.0', accept: '*/*' },
      },
      (res) => {
        // Only the status line and headers matter; never download the body.
        res.destroy();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const NETWORK_MESSAGES = {
  ENOTFOUND: 'The domain name could not be resolved.',
  EAI_AGAIN: 'The domain name could not be resolved.',
  ECONNREFUSED: 'The server refused the connection.',
  ECONNRESET: 'The connection was reset by the server.',
  ETIMEDOUT: 'The connection timed out.',
  EHOSTUNREACH: 'The host could not be reached.',
  ENETUNREACH: 'The host could not be reached.',
  CERT_HAS_EXPIRED: 'The TLS certificate has expired.',
  DEPTH_ZERO_SELF_SIGNED_CERT: 'The TLS certificate is self-signed.',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'The TLS certificate could not be verified.',
  ERR_TLS_CERT_ALTNAME_INVALID: 'The TLS certificate does not match the domain.',
};

/**
 * Checks whether a website responds. Throws a plain Error (user-safe message) for invalid input
 * and BlockedError when the initial destination is not allowed.
 */
export async function checkWebsite(input, lookup = safeLookup) {
  let url = parseTarget(input);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOTAL_TIMEOUT_MS);
  const result = (status, extra) => ({
    status,
    httpStatus: null,
    responseTimeMs: Date.now() - started,
    finalUrl: url.href,
    redirects: 0,
    checkedAt: new Date().toISOString(),
    message: null,
    ...extra,
  });
  let redirects = 0;
  try {
    for (;;) {
      let res;
      try {
        res = await requestOnce(url, controller.signal, lookup);
      } catch (e) {
        if (e instanceof BlockedError || e?.code === 'EBLOCKED') {
          if (redirects === 0) throw new BlockedError();
          return result('inconclusive', { redirects, message: 'The site redirected to a destination that is not allowed.' });
        }
        if (controller.signal.aborted) {
          return result('unavailable', { redirects, message: 'The request timed out after 8 seconds.' });
        }
        return result('unavailable', {
          redirects,
          message: NETWORK_MESSAGES[e?.code] ?? 'The server could not be reached.',
        });
      }
      if ([301, 302, 303, 307, 308].includes(res.status) && res.location) {
        if (redirects >= MAX_REDIRECTS) {
          return result('inconclusive', { redirects, httpStatus: res.status, message: 'Too many redirects.' });
        }
        let next;
        try {
          next = new URL(res.location, url);
          if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error('protocol');
          assertAllowedDestination(next); // revalidate every hop
        } catch {
          return result('inconclusive', { redirects, httpStatus: res.status, message: 'The site redirected to a destination that is not allowed.' });
        }
        url = next;
        redirects++;
        continue;
      }
      return result(res.status >= 500 ? 'unavailable' : 'available', {
        httpStatus: res.status,
        redirects,
        message: res.status >= 500 ? 'The server responded with an error.' : null,
      });
    }
  } finally {
    clearTimeout(timer);
  }
}
