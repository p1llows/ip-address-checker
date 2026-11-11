export interface IpifyResponse {
  ip: string;
}

export class IpLookupError extends Error {}

const IPIFY_URL = 'https://api.ipify.org?format=json';
const TIMEOUT_MS = 10_000;

// Loose sanity check: IPv4 or IPv6 characters only.
const IP_PATTERN = /^(?:\d{1,3}(?:\.\d{1,3}){3}|[0-9a-fA-F:]+:[0-9a-fA-F:.]*)$/;

export function parseIpResponse(data: unknown): string {
  const ip = (data as Partial<IpifyResponse> | null)?.ip;
  if (typeof ip !== 'string' || !IP_PATTERN.test(ip.trim())) {
    throw new IpLookupError('The lookup service returned an unexpected response.');
  }
  return ip.trim();
}

export async function fetchPublicIp(fetchFn: typeof fetch = fetch): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchFn(IPIFY_URL, { signal: controller.signal, cache: 'no-store' });
    } catch {
      throw new IpLookupError(
        'Could not reach the IP lookup service. Check your connection and try again.',
      );
    }
    if (!res.ok) {
      throw new IpLookupError(`The IP lookup service is unavailable (HTTP ${res.status}).`);
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new IpLookupError('The lookup service returned an unexpected response.');
    }
    return parseIpResponse(data);
  } finally {
    clearTimeout(timer);
  }
}
