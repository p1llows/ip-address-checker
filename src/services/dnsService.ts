import { IpLookupError } from './ipService';

// Cloudflare DNS-over-HTTPS (JSON API, CORS enabled, no key).
const DOH_URL = 'https://cloudflare-dns.com/dns-query';
const TIMEOUT_MS = 8_000;

export const DNS_RECORD_TYPES = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'SOA'] as const;
export type DnsRecordType = (typeof DNS_RECORD_TYPES)[number];

const TYPE_CODES: Record<DnsRecordType, number> = {
  A: 1,
  NS: 2,
  CNAME: 5,
  SOA: 6,
  MX: 15,
  TXT: 16,
  AAAA: 28,
};

export interface DnsRecord {
  type: DnsRecordType;
  value: string;
  ttl: number | null;
  priority: number | null;
}

interface DohAnswer {
  type: number;
  TTL?: number;
  data: string;
}

interface DohResult {
  nxdomain: boolean;
  answers: DohAnswer[];
}

async function dohQuery(
  domain: string,
  type: DnsRecordType,
  fetchFn: typeof fetch,
): Promise<DohResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let res: Response;
    try {
      res = await fetchFn(`${DOH_URL}?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) throw new IpLookupError('The DNS request timed out.');
      throw new IpLookupError('Could not reach the DNS service. Check your connection.');
    }
    if (res.status === 429) {
      throw new IpLookupError('The DNS service is rate limiting requests. Please wait a moment.');
    }
    if (!res.ok) throw new IpLookupError(`The DNS service is unavailable (HTTP ${res.status}).`);
    let data: { Status?: number; Answer?: DohAnswer[] };
    try {
      data = await res.json();
    } catch {
      throw new IpLookupError('The DNS service returned an unexpected response.');
    }
    // Status 3 = NXDOMAIN; 0 = success (possibly with no answers).
    if (data.Status === 3) return { nxdomain: true, answers: [] };
    if (data.Status !== 0) throw new IpLookupError('The DNS lookup failed (server error).');
    return { nxdomain: false, answers: Array.isArray(data.Answer) ? data.Answer : [] };
  } finally {
    clearTimeout(timer);
  }
}

/** TXT data arrives as one or more quoted strings; join them and unescape. */
export function parseTxt(data: string): string {
  const parts = [...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
    m[1].replace(/\\(\d{3})/g, (_, d) => String.fromCharCode(Number(d))).replace(/\\(.)/g, '$1'),
  );
  return parts.length ? parts.join('') : data;
}

export function parseAnswer(type: DnsRecordType, a: DohAnswer): DnsRecord {
  const base = { type, ttl: typeof a.TTL === 'number' ? a.TTL : null, priority: null as number | null };
  switch (type) {
    case 'MX': {
      const m = a.data.match(/^(\d+)\s+(.+)$/);
      return m ? { ...base, priority: Number(m[1]), value: m[2] } : { ...base, value: a.data };
    }
    case 'TXT':
      return { ...base, value: parseTxt(a.data) };
    default:
      return { ...base, value: a.data };
  }
}

export interface DnsResult {
  domain: string;
  nxdomain: boolean;
  records: Record<DnsRecordType, DnsRecord[]>;
  /** Types whose query failed even though others succeeded. */
  errors: Partial<Record<DnsRecordType, string>>;
}

export async function lookupRecords(
  domain: string,
  types: readonly DnsRecordType[] = DNS_RECORD_TYPES,
  fetchFn: typeof fetch = fetch,
): Promise<DnsResult> {
  const settled = await Promise.allSettled(types.map((t) => dohQuery(domain, t, fetchFn)));
  const records = Object.fromEntries(DNS_RECORD_TYPES.map((t) => [t, [] as DnsRecord[]])) as DnsResult['records'];
  const errors: DnsResult['errors'] = {};
  let nxdomain = false;
  let firstError: unknown = null;
  let succeeded = 0;

  settled.forEach((s, i) => {
    const type = types[i];
    if (s.status === 'rejected') {
      firstError ??= s.reason;
      errors[type] = s.reason instanceof Error ? s.reason.message : 'Lookup failed.';
      return;
    }
    succeeded++;
    if (s.value.nxdomain) nxdomain = true;
    // Answers may include a CNAME chain; keep only records of the requested type.
    records[type] = s.value.answers
      .filter((a) => a.type === TYPE_CODES[type])
      .map((a) => parseAnswer(type, a));
  });

  if (succeeded === 0) {
    throw firstError instanceof Error ? firstError : new IpLookupError('The DNS lookup failed.');
  }
  return { domain, nxdomain, records, errors };
}

export interface ResolvedAddresses {
  domain: string;
  ipv4: string[];
  ipv6: string[];
}

export async function resolveDomain(
  domain: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResolvedAddresses> {
  const r = await lookupRecords(domain, ['A', 'AAAA'], fetchFn);
  const uniq = (xs: DnsRecord[]) => [...new Set(xs.map((x) => x.value))];
  return { domain, ipv4: uniq(r.records.A), ipv6: uniq(r.records.AAAA) };
}
