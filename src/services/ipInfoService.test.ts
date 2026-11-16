import { describe, expect, it } from 'vitest';
import { combineResults, fetchIpInfo, parseGeojs, parseIpapi, parseIpinfo, parseIpwho } from './ipInfoService';

const ipwho = {
  success: true, ip: '116.50.237.74', type: 'IPv4', country: 'Philippines', region: 'National Capital Region',
  city: 'Manila', postal: '1000', latitude: 14.6042, longitude: 120.9822,
  connection: { asn: 9658, org: 'Eastern Telecoms', isp: 'Eastern Telecommunications Philippines, Inc.' },
  timezone: { id: 'Asia/Manila' },
};
const ipinfo = {
  ip: '116.50.237.74', city: 'Quezon City', region: 'National Capital Region', country: 'PH',
  loc: '14.6488,121.0509', org: 'AS9658 Eastern Telecoms Phils., Inc.', postal: '1100', timezone: 'Asia/Manila',
};
const geojs = {
  ip: '116.50.237.74', accuracy: 10, asn: 9658, city: 'Manila', region: 'Metro Manila', country: 'Philippines',
  latitude: '14.5971', longitude: '120.9798', organization_name: 'Eastern Telecoms Phils., Inc.', timezone: 'Asia/Manila',
};
const ipapi = {
  ip: '116.50.237.74', city: 'Pasig City', region: 'Metro Manila', country_name: 'Philippines',
  latitude: 14.5764, longitude: 121.0851, org: 'Eastern Telecoms', asn: 'AS9658', postal: '1600', timezone: 'Asia/Manila',
};

describe('provider parsers', () => {
  it('parses ipwho.is', () => {
    expect(parseIpwho(ipwho)).toMatchObject({ asn: 'AS9658', isp: expect.stringContaining('Eastern'), estimate: { city: 'Manila' } });
  });
  it('parses ipinfo.io: splits "lat,lon", converts country code, strips ASN from org', () => {
    const r = parseIpinfo(ipinfo);
    expect(r.estimate).toMatchObject({ latitude: 14.6488, longitude: 121.0509, country: 'Philippines' });
    expect(r.organization).toBe('Eastern Telecoms Phils., Inc.');
    expect(r.asn).toBe('AS9658');
  });
  it('parses geojs.io: string coordinates and its own accuracy radius', () => {
    expect(parseGeojs(geojs).estimate).toMatchObject({ latitude: 14.5971, accuracyKm: 10 });
  });
  it('treats "nil", missing and 0,0 coordinates as no estimate', () => {
    expect(parseGeojs({ ip: '1.1.1.1', latitude: 'nil', longitude: 'nil' }).estimate).toBeNull();
    expect(parseIpwho({ success: true, ip: '1.1.1.1', latitude: 0, longitude: 0 }).estimate).toBeNull();
    expect(parseIpinfo({ ip: '1.1.1.1' }).estimate).toBeNull();
  });
  it('flags anycast from ipinfo', () => {
    expect(parseIpinfo({ ...ipinfo, anycast: true }).anycast).toBe(true);
  });
  it('surfaces provider errors', () => {
    expect(() => parseIpwho({ success: false, message: 'Reserved range' })).toThrow('Reserved range');
    expect(() => parseIpapi({ error: true, reason: 'RateLimited' })).toThrow(/Too many/);
    expect(() => parseIpwho(null)).toThrow();
  });
});

describe('combineResults', () => {
  const all = [parseIpwho(ipwho), parseIpinfo(ipinfo), parseGeojs(geojs), parseIpapi(ipapi)];
  it('combines agreeing sources with a spread-based radius and high confidence', () => {
    const i = combineResults('116.50.237.74', all);
    expect(i.confidence).toBe('high');
    expect(i.agreeing).toHaveLength(4);
    expect(i.accuracyKm).toBeGreaterThan(5);
    expect(i.accuracyKm).toBeLessThan(25);
    expect(i.estimates).toHaveLength(4);
    expect(i.isp).toMatch(/Eastern/); // from ipwho.is, the only one with a real ISP name
    expect(i.asn).toBe('AS9658');
  });
  it('drops the pin for anycast addresses', () => {
    const i = combineResults('1.1.1.1', [parseIpinfo({ ...ipinfo, anycast: true }), parseGeojs(geojs)]);
    expect(i.latitude).toBeNull();
    expect(i.anycast).toBe(true);
    expect(i.city).toBeNull();
    expect(i.country).toBeNull();
    expect(i.confidenceNote).toMatch(/anycast/);
  });
  it('still returns network details when no source has coordinates', () => {
    const i = combineResults('1.1.1.1', [parseGeojs({ ip: '1.1.1.1', latitude: 'nil', longitude: 'nil', asn: 13335, organization_name: 'Cloudflare' })]);
    expect(i.latitude).toBeNull();
    expect(i.asn).toBe('AS13335');
  });
});

describe('fetchIpInfo', () => {
  const route = (map: Record<string, () => Response | Promise<Response>>) =>
    (async (url: string) => {
      const host = Object.keys(map).find((h) => url.includes(h));
      if (!host) throw new TypeError('offline');
      return map[host]();
    }) as unknown as typeof fetch;
  const json = (b: unknown, status = 200) => () => new Response(JSON.stringify(b), { status });

  it('survives some providers failing', async () => {
    const f = route({ 'ipwho.is': json({}, 429), 'ipinfo.io': json(ipinfo), 'geojs.io': json(geojs) });
    const i = await fetchIpInfo('116.50.237.1', f);
    expect(i.estimates.map((e) => e.source).sort()).toEqual(['geojs.io', 'ipinfo.io']);
  });
  it('reports rate limiting only when every provider is limited', async () => {
    const f = route({ 'ipwho.is': json({}, 429), 'ipinfo.io': json({}, 429), 'geojs.io': json({}, 429), 'ipapi.co': json({}, 429) });
    await expect(fetchIpInfo('203.0.113.77', f)).rejects.toThrow(/Too many/);
  });
  it('reports a connection problem when nothing is reachable', async () => {
    await expect(fetchIpInfo('203.0.113.78', route({}))).rejects.toThrow(/Could not reach/);
  });
  it('caches results briefly', async () => {
    let calls = 0;
    const f = route({ 'ipinfo.io': () => (calls++, new Response(JSON.stringify(ipinfo))) });
    await fetchIpInfo('198.51.100.9', f);
    await fetchIpInfo('198.51.100.9', f);
    expect(calls).toBe(1);
  });
});
