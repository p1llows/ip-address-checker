export type InputKind = 'ipv4' | 'ipv6' | 'domain';

export type ClassifiedInput =
  | { ok: true; kind: InputKind; value: string }
  | { ok: false; error: string };

const MAX_INPUT = 300;

export function isIPv4(s: string): boolean {
  const parts = s.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
  );
}

export function isIPv6(s: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(s) || !s.includes(':')) return false;
  try {
    // The URL parser implements strict IPv6 literal validation.
    new URL(`http://[${s}]/`);
    return true;
  } catch {
    return false;
  }
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function isDomain(s: string): boolean {
  if (s.length > 253) return false;
  const labels = s.split('.');
  if (labels.length < 2) return false;
  if (!labels.every((l) => LABEL.test(l))) return false;
  return /^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(labels[labels.length - 1]);
}

export function classifyInput(raw: string): ClassifiedInput {
  const input = raw.trim();
  if (!input) return { ok: false, error: 'Enter an IP address or domain name.' };
  if (input.length > MAX_INPUT) return { ok: false, error: 'That input is too long.' };
  if (/\s/.test(input)) return { ok: false, error: 'Remove spaces from the input.' };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input) || /[/?#@]/.test(input)) {
    return { ok: false, error: 'Enter just an IP address or domain name, without a URL or path.' };
  }
  const bracketed = input.match(/^\[(.+)\]$/);
  const candidate = bracketed ? bracketed[1] : input;
  if (isIPv4(candidate)) return { ok: true, kind: 'ipv4', value: candidate };
  if (isIPv6(candidate)) return { ok: true, kind: 'ipv6', value: candidate.toLowerCase() };
  if (/^[\d.]+$/.test(candidate)) return { ok: false, error: 'That is not a valid IPv4 address.' };
  const domain = candidate.replace(/\.$/, '').toLowerCase();
  if (isDomain(domain)) return { ok: true, kind: 'domain', value: domain };
  return { ok: false, error: 'That is not a valid IP address or domain name.' };
}

// --- Private / reserved detection -------------------------------------------------

function v4ToInt(ip: string): number {
  return ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
}

const V4_RESERVED: Array<[string, number, string]> = [
  ['0.0.0.0', 8, 'unspecified ("this network")'],
  ['10.0.0.0', 8, 'private (RFC 1918)'],
  ['100.64.0.0', 10, 'carrier-grade NAT (shared)'],
  ['127.0.0.0', 8, 'loopback'],
  ['169.254.0.0', 16, 'link-local'],
  ['172.16.0.0', 12, 'private (RFC 1918)'],
  ['192.0.0.0', 24, 'IETF protocol assignment'],
  ['192.0.2.0', 24, 'documentation (TEST-NET-1)'],
  ['192.168.0.0', 16, 'private (RFC 1918)'],
  ['198.18.0.0', 15, 'benchmarking'],
  ['198.51.100.0', 24, 'documentation (TEST-NET-2)'],
  ['203.0.113.0', 24, 'documentation (TEST-NET-3)'],
  ['224.0.0.0', 4, 'multicast'],
  ['240.0.0.0', 4, 'reserved'],
];

/** Expand an IPv6 literal into eight 16-bit groups. Assumes a valid address. */
function v6Groups(ip: string): number[] {
  let s = ip;
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    s = s.slice(0, -tail[1].length) + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }
  const [head, rest] = s.split('::');
  const h = head ? head.split(':') : [];
  const r = rest !== undefined && rest ? rest.split(':') : [];
  const fill = rest === undefined ? [] : Array(8 - h.length - r.length).fill('0');
  return [...h, ...fill, ...r].map((g) => parseInt(g || '0', 16));
}

/** Returns a human description if the address is not publicly routable, otherwise null. */
export function reservedReason(kind: 'ipv4' | 'ipv6', ip: string): string | null {
  if (kind === 'ipv4') {
    const n = v4ToInt(ip);
    for (const [base, bits, why] of V4_RESERVED) {
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if (((n & mask) >>> 0) === ((v4ToInt(base) & mask) >>> 0)) return why;
    }
    if (n === 0xffffffff) return 'broadcast';
    return null;
  }
  const g = v6Groups(ip);
  if (g.every((x) => x === 0)) return 'unspecified';
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return 'loopback';
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return reservedReason('ipv4', `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`)
      ? 'IPv4-mapped address of a non-public IPv4 address'
      : null;
  }
  if ((g[0] & 0xfe00) === 0xfc00) return 'unique local (private)';
  if ((g[0] & 0xffc0) === 0xfe80) return 'link-local';
  if ((g[0] & 0xff00) === 0xff00) return 'multicast';
  if (g[0] === 0x2001 && g[1] === 0x0db8) return 'documentation';
  return null;
}
