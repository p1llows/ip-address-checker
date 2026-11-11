import { describe, expect, it } from 'vitest';
import { fetchPublicIp, IpLookupError } from './ipService';

const respond = (body: unknown, init: ResponseInit = {}) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), init)) as typeof fetch;

describe('fetchPublicIp', () => {
  it('returns the ip on success', async () => {
    expect(await fetchPublicIp(respond({ ip: '203.0.113.7' }))).toBe('203.0.113.7');
  });
  it('accepts IPv6', async () => {
    expect(await fetchPublicIp(respond({ ip: '2001:db8::1' }))).toBe('2001:db8::1');
  });
  it('rejects non-ok responses', async () => {
    await expect(fetchPublicIp(respond({}, { status: 503 }))).rejects.toThrow(/HTTP 503/);
  });
  it('rejects network failure', async () => {
    const f = (async () => {
      throw new TypeError('x');
    }) as typeof fetch;
    await expect(fetchPublicIp(f)).rejects.toBeInstanceOf(IpLookupError);
  });
  it('rejects invalid JSON', async () => {
    await expect(fetchPublicIp(respond('<html>'))).rejects.toThrow(/unexpected/);
  });
  it('rejects missing or bad ip', async () => {
    await expect(fetchPublicIp(respond({ foo: 1 }))).rejects.toThrow(/unexpected/);
    await expect(fetchPublicIp(respond({ ip: 'hello' }))).rejects.toThrow(/unexpected/);
  });
});
