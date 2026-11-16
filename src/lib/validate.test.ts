import { describe, expect, it } from 'vitest';
import { classifyInput, reservedReason } from './validate';

const ok = (s: string) => classifyInput(s);

describe('classifyInput', () => {
  it('accepts IPv4, IPv6 and domains', () => {
    expect(ok('8.8.8.8')).toEqual({ ok: true, kind: 'ipv4', value: '8.8.8.8' });
    expect(ok('2001:4860:4860::8888')).toMatchObject({ ok: true, kind: 'ipv6' });
    expect(ok('[::1]')).toMatchObject({ ok: true, kind: 'ipv6', value: '::1' });
    expect(ok(' Google.COM. ')).toEqual({ ok: true, kind: 'domain', value: 'google.com' });
    expect(ok('xn--bcher-kva.example')).toMatchObject({ ok: true, kind: 'domain' });
  });
  it('rejects malformed input', () => {
    for (const bad of [
      '', '   ', '999.1.1.1', '1.2.3', '01.2.3.4', '1.2.3.4.5', ':::', '12345::abcde', 'a b.com',
      'localhost', '-bad.com', 'bad-.com', 'a..com', 'foo.123', 'https://google.com',
      'google.com/path', 'user@host.com', '<script>.com', 'x'.repeat(400),
    ]) {
      expect(ok(bad).ok, bad).toBe(false);
    }
  });
  it('rejects over-long domains', () => {
    expect(ok(`${'a'.repeat(64)}.com`).ok).toBe(false);
    expect(ok(`${'a.'.repeat(130)}com`).ok).toBe(false);
  });
});

describe('reservedReason', () => {
  it('flags private/reserved IPv4', () => {
    for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1',
      '169.254.1.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '203.0.113.9']) {
      expect(reservedReason('ipv4', ip), ip).not.toBeNull();
    }
  });
  it('allows public IPv4', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '172.15.0.1', '100.128.0.1']) {
      expect(reservedReason('ipv4', ip), ip).toBeNull();
    }
  });
  it('handles IPv6', () => {
    for (const ip of ['::', '::1', 'fe80::1', 'fd12:3456::1', 'ff02::1', '2001:db8::1', '::ffff:10.0.0.1']) {
      expect(reservedReason('ipv6', ip), ip).not.toBeNull();
    }
    for (const ip of ['2001:4860:4860::8888', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(reservedReason('ipv6', ip), ip).toBeNull();
    }
  });
});
