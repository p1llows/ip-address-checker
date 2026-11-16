import { isIPv4, isIPv6, reservedReason } from '../lib/validate';

export type PrivacyStatus = 'none' | 'potential' | 'unknown';

// ---------------------------------------------------------------- WebRTC

export interface WebRtcAddress {
  address: string;
  candidateType: string; // host | srflx | prflx | relay
  kind: 'public' | 'private' | 'mdns';
  matchesPublicIp: boolean;
}

export interface WebRtcAnalysis {
  status: PrivacyStatus;
  addresses: WebRtcAddress[];
  explanation: string;
}

/** Parses "candidate:1 1 udp 2113937151 192.168.1.2 54321 typ host ..." into address + type. */
export function parseCandidate(line: string): { address: string; candidateType: string } | null {
  const f = line.replace(/^a=/, '').trim().split(/\s+/);
  const typIdx = f.indexOf('typ');
  if (f.length < 8 || typIdx < 0 || !f[0].startsWith('candidate:')) return null;
  return { address: f[4], candidateType: f[typIdx + 1] ?? 'unknown' };
}

function classify(address: string): WebRtcAddress['kind'] | null {
  if (address.endsWith('.local')) return 'mdns';
  const v4 = isIPv4(address);
  if (!v4 && !isIPv6(address)) return null;
  return reservedReason(v4 ? 'ipv4' : 'ipv6', address) ? 'private' : 'public';
}

export function analyzeCandidates(candidateLines: string[], knownPublicIps: string[]): WebRtcAnalysis {
  const known = new Set(knownPublicIps.map((x) => x.toLowerCase()));
  const seen = new Set<string>();
  const addresses: WebRtcAddress[] = [];
  for (const line of candidateLines) {
    const c = parseCandidate(line);
    if (!c) continue;
    const kind = classify(c.address);
    if (!kind || seen.has(c.address)) continue;
    seen.add(c.address);
    addresses.push({
      ...c,
      kind,
      matchesPublicIp: kind === 'public' && known.has(c.address.toLowerCase()),
    });
  }

  if (addresses.length === 0) {
    return {
      status: 'unknown',
      addresses,
      explanation:
        'No WebRTC candidates were gathered. The browser may block WebRTC, or a network or extension may be filtering it, so the result is inconclusive.',
    };
  }
  const publicOnes = addresses.filter((a) => a.kind === 'public');
  const mismatched = publicOnes.filter((a) => !a.matchesPublicIp);
  if (mismatched.length > 0) {
    return {
      status: 'potential',
      addresses,
      explanation:
        known.size === 0
          ? 'WebRTC exposed public addresses, but your detected public IP is not known, so they could not be compared.'
          : `WebRTC exposed ${mismatched.length === 1 ? 'a public address' : 'public addresses'} that differ from the public IP this site detected. If you are using a VPN, a website could use WebRTC to learn this address. Differences can also be harmless, for example an IPv6 address your connection does not otherwise use.`,
    };
  }
  if (known.size === 0 && publicOnes.length > 0) {
    return {
      status: 'unknown',
      addresses,
      explanation: 'Your detected public IP is unavailable, so WebRTC addresses could not be compared with it.',
    };
  }
  return {
    status: 'none',
    addresses,
    explanation:
      publicOnes.length > 0
        ? 'The public addresses WebRTC exposed match the public IP detected by this site.'
        : 'WebRTC exposed no public addresses. Local (private) addresses may still be visible to websites; modern browsers hide them behind random .local names.',
  };
}

export async function gatherWebRtcCandidates(timeoutMs = 5000): Promise<string[]> {
  if (typeof RTCPeerConnection === 'undefined') throw new Error('unsupported');
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] });
  const lines: string[] = [];
  try {
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      const t = setTimeout(done, timeoutMs);
      pc.onicecandidate = (e) => {
        if (!e.candidate) {
          clearTimeout(t);
          done();
        } else if (e.candidate.candidate) {
          lines.push(e.candidate.candidate);
        }
      };
      pc.createDataChannel('probe');
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .catch(() => {
          clearTimeout(t);
          done();
        });
    });
  } finally {
    pc.close();
  }
  return lines;
}

// ---------------------------------------------------------------- DNS resolvers

export interface DnsResolver {
  ip: string;
  org: string | null;
  country: string | null;
}

export interface DnsTestResult {
  resolvers: DnsResolver[];
  publicIp: string | null;
}

interface RawEntry {
  type: string;
  ip: string | null;
  org: string | null;
  country: string | null;
}

export function parseDnsTest(entries: RawEntry[]): DnsTestResult {
  return {
    publicIp: entries.find((e) => e.type === 'ip')?.ip ?? null,
    resolvers: entries
      .filter((e) => e.type === 'dns' && e.ip)
      .map((e) => ({ ip: e.ip!, org: e.org, country: e.country })),
  };
}

/**
 * Compares observed resolvers with the provider the user expects (e.g. "NordVPN", "Cloudflare").
 * A different organisation is NOT proof of a leak, so this only reports "potential".
 */
export function compareExpectedResolver(
  resolvers: DnsResolver[],
  expected: string,
): { status: PrivacyStatus; explanation: string } {
  const want = expected.trim().toLowerCase();
  if (resolvers.length === 0) {
    return { status: 'unknown', explanation: 'No DNS resolvers were observed, so nothing can be compared.' };
  }
  if (!want) {
    return {
      status: 'unknown',
      explanation:
        'Resolvers are listed above. Enter the DNS provider you expect (for example your VPN provider) to compare. Without that, this tool cannot tell whether a resolver is expected.',
    };
  }
  const outside = resolvers.filter((r) => !(r.org ?? '').toLowerCase().includes(want));
  if (outside.length === 0) {
    return { status: 'none', explanation: `All observed resolvers belong to an organization matching "${expected.trim()}".` };
  }
  return {
    status: 'potential',
    explanation: `${outside.length} of ${resolvers.length} observed resolver${resolvers.length === 1 ? '' : 's'} did not match "${expected.trim()}". This is an indicator, not proof of a leak: providers often use resolvers registered to other organizations or CDNs.`,
  };
}

export async function runDnsTest(signal: AbortSignal, fetchFn: typeof fetch = fetch): Promise<DnsTestResult> {
  const call = async (qs: string) => {
    const res = await fetchFn(`/api/dns-leak?${qs}`, { signal });
    if (res.status === 429) throw new Error('Too many tests. Please wait a minute and try again.');
    if (!res.ok) throw new Error('The DNS test service is unavailable right now.');
    return res.json();
  };
  const { id } = (await call('action=id')) as { id?: string };
  if (typeof id !== 'string') throw new Error('The DNS test service returned an unexpected response.');
  // Unique hostnames force the browser's resolver to query the test service's DNS servers.
  // Failures are expected (we never read the responses); only the DNS lookup matters.
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      fetchFn(`https://${i + 1}.${id}.bash.ws/`, { mode: 'no-cors', cache: 'no-store', signal }).catch(() => undefined),
    ),
  );
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
  const data = (await call(`action=result&id=${id}`)) as { entries?: RawEntry[] };
  if (!Array.isArray(data.entries)) throw new Error('The DNS test service returned an unexpected response.');
  return parseDnsTest(data.entries);
}

// ---------------------------------------------------------------- VPN comparison

export interface ConnectionSnapshot {
  ip: string;
  country: string | null;
  isp: string | null;
  asn: string | null;
  resolvers: string[];
  savedAt: number;
}

export interface ComparisonRow {
  label: string;
  before: string;
  after: string;
  changed: boolean;
}

export function compareSnapshots(a: ConnectionSnapshot, b: ConnectionSnapshot): ComparisonRow[] {
  const show = (v: string | null) => v ?? 'Unavailable';
  const row = (label: string, x: string | null, y: string | null): ComparisonRow => ({
    label,
    before: show(x),
    after: show(y),
    changed: show(x) !== show(y),
  });
  const res = (s: ConnectionSnapshot) => (s.resolvers.length ? [...s.resolvers].sort().join(', ') : null);
  return [
    row('Public IP', a.ip, b.ip),
    row('Country', a.country, b.country),
    row('ISP / organization', a.isp, b.isp),
    row('ASN', a.asn, b.asn),
    row('DNS resolvers', res(a), res(b)),
  ];
}

const SNAP_KEY = 'ip-tools:vpn-baseline';

export function loadBaseline(): ConnectionSnapshot | null {
  try {
    const p = JSON.parse(localStorage.getItem(SNAP_KEY) ?? 'null');
    return p && typeof p.ip === 'string' && Number.isFinite(p.savedAt) && Array.isArray(p.resolvers) ? p : null;
  } catch {
    return null;
  }
}

export function saveBaseline(s: ConnectionSnapshot | null) {
  try {
    if (s) localStorage.setItem(SNAP_KEY, JSON.stringify(s));
    else localStorage.removeItem(SNAP_KEY);
  } catch {
    /* storage unavailable: baseline just isn't persisted */
  }
}
