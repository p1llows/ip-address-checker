import { describe, expect, it } from 'vitest';
import { lookupRecords, parseAnswer, parseTxt, resolveDomain } from './dnsService';

const doh = (byType: Record<string, unknown>) =>
  (async (url: string) => {
    const t = new URL(url).searchParams.get('type')!;
    const body = byType[t] ?? { Status: 0 };
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;

describe('record parsing', () => {
  it('joins and unescapes TXT strings', () => {
    expect(parseTxt('"v=spf1 " "include:x.com ~all"')).toBe('v=spf1 include:x.com ~all');
    expect(parseTxt('"say \\"hi\\""')).toBe('say "hi"');
  });
  it('splits MX priority', () => {
    expect(parseAnswer('MX', { type: 15, TTL: 60, data: '10 mail.example.com.' })).toMatchObject({
      priority: 10,
      value: 'mail.example.com.',
      ttl: 60,
    });
  });
});

describe('lookupRecords', () => {
  it('groups by type and ignores CNAME chain entries in A answers', async () => {
    const f = doh({
      A: { Status: 0, Answer: [{ type: 5, TTL: 5, data: 'x.example.net.' }, { type: 1, TTL: 5, data: '1.2.3.4' }] },
      MX: { Status: 0, Answer: [{ type: 15, TTL: 9, data: '5 mx.example.com.' }] },
    });
    const r = await lookupRecords('example.com', undefined, f);
    expect(r.records.A.map((x) => x.value)).toEqual(['1.2.3.4']);
    expect(r.records.MX[0].priority).toBe(5);
    expect(r.records.TXT).toEqual([]);
    expect(r.nxdomain).toBe(false);
  });
  it('flags NXDOMAIN', async () => {
    const f = doh({ A: { Status: 3 }, AAAA: { Status: 3 } });
    expect((await lookupRecords('nope.example', ['A', 'AAAA'], f)).nxdomain).toBe(true);
  });
  it('reports partial failures per type', async () => {
    const f = doh({ MX: new TypeError('x'), A: { Status: 0, Answer: [{ type: 1, TTL: 1, data: '1.1.1.1' }] } });
    const r = await lookupRecords('example.com', ['A', 'MX'], f);
    expect(r.records.A).toHaveLength(1);
    expect(r.errors.MX).toMatch(/Could not reach/);
  });
  it('throws when every query fails', async () => {
    const f = (async () => {
      throw new TypeError('x');
    }) as typeof fetch;
    await expect(lookupRecords('example.com', ['A'], f)).rejects.toThrow(/Could not reach/);
  });
  it('resolveDomain dedupes addresses', async () => {
    const f = doh({
      A: { Status: 0, Answer: [{ type: 1, data: '1.1.1.1' }, { type: 1, data: '1.1.1.1' }] },
      AAAA: { Status: 0, Answer: [{ type: 28, data: '2606::1' }] },
    });
    expect(await resolveDomain('example.com', f)).toEqual({
      domain: 'example.com', ipv4: ['1.1.1.1'], ipv6: ['2606::1'],
    });
  });
});
