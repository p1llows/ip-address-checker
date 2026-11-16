import { buildConsensus, type Confidence, type GeoEstimate } from '../lib/geo';
import { IpLookupError } from './ipService';

/**
 * Normalised IP metadata, combined from several providers.
 * Any field no provider supplied is null (shown as "Unavailable"), never guessed.
 */
export interface IpInfo {
  ip: string;
  version: 'IPv4' | 'IPv6' | null;
  isp: string | null;
  organization: string | null;
  asn: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  timezone: string | null;
  /** Combined position (null if unavailable or the address is anycast). */
  latitude: number | null;
  longitude: number | null;
  /** Radius (km) of the area the real location probably lies in. */
  accuracyKm: number | null;
  confidence: Confidence | null;
  confidenceNote: string | null;
  /** Anycast addresses are served from many places at once, so they have no single location. */
  anycast: boolean;
  /** Every source's own estimate, for transparency and the map. */
  estimates: GeoEstimate[];
  /** Sources whose estimate agreed with the combined position. */
  agreeing: string[];
}

/** What one provider told us. */
export interface ProviderResult {
  source: string;
  ip: string | null;
  version: 'IPv4' | 'IPv6' | null;
  isp: string | null;
  organization: string | null;
  asn: string | null;
  timezone: string | null;
  anycast: boolean;
  estimate: GeoEstimate | null;
}

const TIMEOUT_MS = 8_000;
const CACHE_MS = 5 * 60_000;

// ------------------------------------------------------------------ parsing helpers

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' && v.trim() !== 'nil' ? v.trim() : null;
/** Accepts numbers and numeric strings (some providers return coordinates as strings). */
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

function validCoords(lat: number | null, lon: number | null): [number, number] | null {
  if (lat === null || lon === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  if (lat === 0 && lon === 0) return null; // "null island": providers use it for "unknown"
  return [lat, lon];
}

const versionOf = (ip: string | null): 'IPv4' | 'IPv6' | null =>
  ip === null ? null : ip.includes(':') ? 'IPv6' : 'IPv4';

const asnOf = (v: unknown): string | null => {
  const n = num(v);
  if (n !== null) return `AS${n}`;
  const m = typeof v === 'string' ? v.match(/AS\d+/i) : null;
  return m ? m[0].toUpperCase() : null;
};

let regionNames: Intl.DisplayNames | null = null;
function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

const estimateOf = (
  source: string,
  lat: number | null,
  lon: number | null,
  rest: Partial<GeoEstimate>,
): GeoEstimate | null => {
  const c = validCoords(lat, lon);
  return c
    ? { source, latitude: c[0], longitude: c[1], city: null, region: null, country: null, postalCode: null, accuracyKm: null, ...rest }
    : null;
};

// ------------------------------------------------------------------ providers

export function parseIpwho(data: unknown): ProviderResult {
  const d = obj(data);
  if (d.success === false) throw new IpLookupError(str(d.message) ?? 'No information is available for this address.');
  const ip = str(d.ip);
  if (!ip) throw new IpLookupError('The lookup service returned an unexpected response.');
  const conn = obj(d.connection);
  const type = str(d.type);
  return {
    source: 'ipwho.is',
    ip,
    version: type === 'IPv4' || type === 'IPv6' ? type : versionOf(ip),
    isp: str(conn.isp),
    organization: str(conn.org),
    asn: asnOf(conn.asn),
    timezone: str(obj(d.timezone).id),
    anycast: false,
    estimate: estimateOf('ipwho.is', num(d.latitude), num(d.longitude), {
      city: str(d.city), region: str(d.region), country: str(d.country), postalCode: str(d.postal),
    }),
  };
}

export function parseIpinfo(data: unknown): ProviderResult {
  const d = obj(data);
  if (d.error || d.bogon === true) throw new IpLookupError('No information is available for this address.');
  const ip = str(d.ip);
  if (!ip) throw new IpLookupError('The lookup service returned an unexpected response.');
  const [lat, lon] = typeof d.loc === 'string' ? d.loc.split(',').map(num) : [null, null];
  const org = str(d.org); // "AS9658 Eastern Telecoms Phils., Inc."
  return {
    source: 'ipinfo.io',
    ip,
    version: versionOf(ip),
    isp: null,
    organization: org ? org.replace(/^AS\d+\s*/i, '') || null : null,
    asn: asnOf(org),
    timezone: str(d.timezone),
    anycast: d.anycast === true,
    estimate: estimateOf('ipinfo.io', lat ?? null, lon ?? null, {
      city: str(d.city), region: str(d.region), country: countryName(str(d.country)), postalCode: str(d.postal),
    }),
  };
}

export function parseGeojs(data: unknown): ProviderResult {
  const d = obj(data);
  const ip = str(d.ip);
  if (!ip) throw new IpLookupError('The lookup service returned an unexpected response.');
  const acc = num(d.accuracy);
  return {
    source: 'geojs.io',
    ip,
    version: versionOf(ip),
    isp: null,
    organization: str(d.organization_name),
    asn: asnOf(d.asn),
    timezone: str(d.timezone),
    anycast: false,
    estimate: estimateOf('geojs.io', num(d.latitude), num(d.longitude), {
      city: str(d.city), region: str(d.region), country: str(d.country),
      accuracyKm: acc !== null && acc > 0 ? acc : null,
    }),
  };
}

export function parseIpapi(data: unknown): ProviderResult {
  const d = obj(data);
  if (d.error) {
    throw new IpLookupError(
      str(d.reason) === 'RateLimited' ? 'Too many requests to the IP information service.' : 'No information is available for this address.',
    );
  }
  const ip = str(d.ip);
  if (!ip) throw new IpLookupError('The lookup service returned an unexpected response.');
  return {
    source: 'ipapi.co',
    ip,
    version: versionOf(ip),
    isp: null,
    organization: str(d.org),
    asn: asnOf(d.asn),
    timezone: str(d.timezone),
    anycast: false,
    estimate: estimateOf('ipapi.co', num(d.latitude), num(d.longitude), {
      city: str(d.city), region: str(d.region), country: str(d.country_name), postalCode: str(d.postal),
    }),
  };
}

const PROVIDERS: Array<{ name: string; url: (ip: string) => string; parse: (d: unknown) => ProviderResult }> = [
  { name: 'ipwho.is', url: (ip) => `https://ipwho.is/${encodeURIComponent(ip)}`, parse: parseIpwho },
  { name: 'ipinfo.io', url: (ip) => `https://ipinfo.io/${encodeURIComponent(ip)}/json`, parse: parseIpinfo },
  { name: 'geojs.io', url: (ip) => `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, parse: parseGeojs },
  { name: 'ipapi.co', url: (ip) => `https://ipapi.co/${encodeURIComponent(ip)}/json/`, parse: parseIpapi },
];

class RateLimited extends IpLookupError {}

async function queryProvider(p: (typeof PROVIDERS)[number], ip: string, fetchFn: typeof fetch): Promise<ProviderResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchFn(p.url(ip), { signal: controller.signal });
    } catch {
      throw new IpLookupError(`Could not reach ${p.name}.`);
    }
    if (res.status === 429) throw new RateLimited(`${p.name} is rate limiting requests.`);
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new IpLookupError(`${p.name} returned an unexpected response.`);
    }
    // Some providers send 429-style errors in the body with a 200/4xx status.
    if (/rate/i.test(String(obj(data).message ?? obj(data).reason ?? ''))) throw new RateLimited(`${p.name} is rate limiting requests.`);
    if (!res.ok && res.status !== 200) throw new IpLookupError(`${p.name} is unavailable (HTTP ${res.status}).`);
    return p.parse(data);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ combining

const first = <T>(xs: Array<T | null>): T | null => xs.find((x) => x !== null) ?? null;

export function combineResults(ip: string, results: ProviderResult[]): IpInfo {
  const estimates = results.map((r) => r.estimate).filter((e): e is GeoEstimate => e !== null);
  const anycast = results.some((r) => r.anycast);
  const consensus = anycast ? null : buildConsensus(estimates);
  // Anycast addresses have no single place, so show no city/region/country rather than a misleading one.
  const place = anycast ? null : consensus?.nearest ?? first(estimates);

  return {
    ip: first(results.map((r) => r.ip)) ?? ip,
    version: first(results.map((r) => r.version)),
    isp: first(results.map((r) => r.isp)),
    organization: first(results.map((r) => r.organization)),
    asn: first(results.map((r) => r.asn)),
    timezone: first(results.map((r) => r.timezone)),
    country: place?.country ?? null,
    region: place?.region ?? null,
    city: place?.city ?? null,
    postalCode: place?.postalCode ?? null,
    latitude: consensus?.latitude ?? null,
    longitude: consensus?.longitude ?? null,
    accuracyKm: consensus?.radiusKm ?? null,
    confidence: consensus?.confidence ?? null,
    confidenceNote: anycast
      ? 'This is an anycast address: it is served from many locations at once, so it has no single physical location. Any coordinates a provider reports are meaningless.'
      : consensus?.note ?? null,
    anycast,
    estimates,
    agreeing: consensus?.cluster.map((e) => e.source) ?? [],
  };
}

const cache = new Map<string, { at: number; info: IpInfo }>();

export async function fetchIpInfo(ip: string, fetchFn: typeof fetch = fetch): Promise<IpInfo> {
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.info;

  const settled = await Promise.allSettled(PROVIDERS.map((p) => queryProvider(p, ip, fetchFn)));
  const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));

  if (ok.length === 0) {
    const reasons = settled.map((s) => (s as PromiseRejectedResult).reason);
    if (reasons.every((r) => r instanceof RateLimited)) {
      throw new IpLookupError('Too many requests to the IP information services. Please wait a moment.');
    }
    // A provider-specific message (e.g. "reserved range") beats a generic one.
    const specific = reasons.find((r) => r instanceof IpLookupError && !/^Could not reach|unavailable|rate limiting|unexpected response/.test(r.message));
    throw specific ?? new IpLookupError('Could not reach the IP information services. Check your connection and try again.');
  }

  const info = combineResults(ip, ok);
  cache.set(ip, { at: Date.now(), info });
  return info;
}
