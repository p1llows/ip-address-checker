import { describe, expect, it } from 'vitest';
import {
  analyzeCandidates, compareExpectedResolver, compareSnapshots, parseCandidate, parseDnsTest,
  type ConnectionSnapshot,
} from './privacyService';
import { computeJitter, median, toMbps } from './speedTestService';
import { checkWebsite } from './websiteCheckService';

const cand = (ip: string, typ: string) => `candidate:1 1 udp 2113937151 ${ip} 54321 typ ${typ} generation 0`;

describe('speed math', () => {
  it('computes jitter from consecutive samples', () => {
    expect(computeJitter([10, 12, 11, 15])).toBeCloseTo((2 + 1 + 4) / 3);
    expect(computeJitter([10])).toBeNull();
  });
  it('median and mbps', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(toMbps(12_500_000, 1000)).toBe(100);
    expect(toMbps(1, 0)).toBe(0);
  });
});

describe('WebRTC analysis', () => {
  it('parses candidates', () => {
    expect(parseCandidate(cand('203.0.113.5', 'srflx'))).toEqual({ address: '203.0.113.5', candidateType: 'srflx' });
    expect(parseCandidate('garbage')).toBeNull();
  });
  it('reports no issue when public candidates match the detected IP', () => {
    const r = analyzeCandidates([cand('192.168.1.5', 'host'), cand('8.8.8.8', 'srflx')], ['8.8.8.8']);
    expect(r.status).toBe('none');
    expect(r.addresses.map((a) => a.kind)).toEqual(['private', 'public']);
  });
  it('flags a differing public address', () => {
    const r = analyzeCandidates([cand('1.2.3.4', 'srflx')], ['8.8.8.8']);
    expect(r.status).toBe('potential');
  });
  it('treats mDNS-obfuscated host candidates as no public exposure', () => {
    const r = analyzeCandidates([cand('abcd-1234.local', 'host')], ['8.8.8.8']);
    expect(r.status).toBe('none');
    expect(r.addresses[0].kind).toBe('mdns');
  });
  it('is unable to verify with no candidates or unknown public IP', () => {
    expect(analyzeCandidates([], ['8.8.8.8']).status).toBe('unknown');
    expect(analyzeCandidates([cand('8.8.8.8', 'srflx')], []).status).toBe('potential');
  });
});

describe('DNS resolver comparison', () => {
  const res = [{ ip: '1.1.1.1', org: 'Cloudflare Inc', country: 'US' }];
  it('parses test entries', () => {
    const d = parseDnsTest([
      { type: 'ip', ip: '9.9.9.9', org: 'x', country: null },
      { type: 'dns', ip: '1.1.1.1', org: 'Cloudflare Inc', country: 'US' },
    ]);
    expect(d.publicIp).toBe('9.9.9.9');
    expect(d.resolvers).toHaveLength(1);
  });
  it('never claims a leak without an expectation', () => {
    expect(compareExpectedResolver(res, '').status).toBe('unknown');
  });
  it('matches and mismatches an expectation', () => {
    expect(compareExpectedResolver(res, 'cloudflare').status).toBe('none');
    const m = compareExpectedResolver(res, 'NordVPN');
    expect(m.status).toBe('potential');
    expect(m.explanation).toMatch(/not proof/);
  });
});

describe('VPN comparison', () => {
  const base: ConnectionSnapshot = { ip: '1.1.1.1', country: 'US', isp: 'A', asn: 'AS1', resolvers: ['x'], savedAt: 1 };
  it('marks changed rows', () => {
    const rows = compareSnapshots(base, { ...base, ip: '2.2.2.2', country: null });
    expect(rows.find((r) => r.label === 'Public IP')!.changed).toBe(true);
    expect(rows.find((r) => r.label === 'Country')!.after).toBe('Unavailable');
    expect(rows.find((r) => r.label === 'ASN')!.changed).toBe(false);
  });
});

describe('website check client', () => {
  const resp = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  it('surfaces server validation messages', async () => {
    await expect(checkWebsite('x', resp({ error: 'That destination is not allowed.' }, 400))).rejects.toThrow(/not allowed/);
  });
  it('handles rate limits and bad payloads', async () => {
    await expect(checkWebsite('x', resp({}, 429))).rejects.toThrow(/Too many/);
    await expect(checkWebsite('x', resp({ nope: 1 }))).rejects.toThrow(/unexpected/);
  });
  it('returns results', async () => {
    const ok = { status: 'available', httpStatus: 200, responseTimeMs: 5, finalUrl: 'https://a/', redirects: 0, checkedAt: 'x', message: null };
    expect((await checkWebsite('a', resp(ok))).httpStatus).toBe(200);
  });
});
