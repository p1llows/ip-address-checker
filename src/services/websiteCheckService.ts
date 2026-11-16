import { IpLookupError } from './ipService';

export interface WebsiteCheck {
  status: 'available' | 'unavailable' | 'inconclusive';
  httpStatus: number | null;
  responseTimeMs: number;
  finalUrl: string;
  redirects: number;
  checkedAt: string;
  message: string | null;
}

const TIMEOUT_MS = 15_000;

/** Checks a website via our server-side endpoint (browsers can't do this reliably because of CORS). */
export async function checkWebsite(input: string, fetchFn: typeof fetch = fetch): Promise<WebsiteCheck> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchFn(`/api/check?url=${encodeURIComponent(input)}`, { signal: controller.signal });
    } catch {
      throw new IpLookupError(
        controller.signal.aborted
          ? 'The check timed out. Please try again.'
          : 'Could not reach the checking service. Check your own connection and try again.',
      );
    }
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* handled below */
    }
    if (res.status === 429) {
      throw new IpLookupError('Too many checks. Please wait a minute and try again.');
    }
    if (!res.ok) {
      const msg = (data as { error?: unknown } | null)?.error;
      throw new IpLookupError(
        typeof msg === 'string' ? msg : 'The checking service is temporarily unavailable.',
      );
    }
    const d = data as Partial<WebsiteCheck> | null;
    if (!d || typeof d.status !== 'string' || typeof d.responseTimeMs !== 'number') {
      throw new IpLookupError('The checking service returned an unexpected response.');
    }
    return d as WebsiteCheck;
  } finally {
    clearTimeout(timer);
  }
}
