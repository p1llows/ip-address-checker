import { describe, expect, it } from 'vitest';
import { checkWebsite } from './_check.js';
import { assertAllowedDestination, BlockedError, isBlockedAddress, parseTarget, safeLookup } from './_ssrf.js';

describe('isBlockedAddress', () => {
  it('blocks private, loopback, link-local and metadata addresses', () => {
    for (const ip of [
      '127.0.0.1', '10.0.0.5', '172.16.5.5', '192.168.0.1', '169.254.169.254', '0.0.0.0',
      '100.64.1.1', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fd00:ec2::254',
      'fc00::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.1.2.3', '64:ff9b::7f00:1',
      '2002:7f00:1::1', 'not-an-ip', '',
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });
});

describe('parseTarget', () => {
  it('adds https:// to bare domains', () => {
    expect(parseTarget('example.com').href).toBe('https://example.com/');
  });
  it('rejects bad schemes, credentials and junk', () => {
    for (const bad of ['file:///etc/passwd', 'ftp://example.com', 'gopher://example.com', 'javascript:alert(1)',
      'http://user:pw@example.com', 'exa mple.com', '', 'x'.repeat(3000)]) {
      expect(() => parseTarget(bad), bad).toThrow();
    }
  });
  it('blocks internal destinations in every encoding', () => {
    for (const bad of ['http://localhost', 'http://127.0.0.1', 'http://2130706433', 'http://0x7f.1',
      'http://017700000001', 'http://[::1]', 'http://[::ffff:127.0.0.1]', 'http://169.254.169.254/latest/meta-data',
      'http://metadata.google.internal', 'http://printer.local', 'http://intranet', 'https://example.com:22',
      'http://10.0.0.1:8080', 'http://0.0.0.0']) {
      expect(() => parseTarget(bad), bad).toThrow(BlockedError);
    }
  });
  it('allows standard public targets', () => {
    expect(() => parseTarget('http://example.com:8080/path?q=1')).not.toThrow();
    expect(() => parseTarget('https://8.8.8.8')).not.toThrow();
  });
  it('revalidates redirect targets', () => {
    expect(() => assertAllowedDestination(new URL('http://169.254.169.254/'))).toThrow(BlockedError);
    expect(() => assertAllowedDestination(new URL('https://example.com/'))).not.toThrow();
  });
});

describe('safeLookup', () => {
  it('refuses hostnames that resolve to loopback', async () => {
    const err = await new Promise((resolve) => safeLookup('localtest.me', {}, (e) => resolve(e)));
    // localtest.me resolves to 127.0.0.1; offline machines fail resolution instead. Either way: no address.
    expect(err).toBeTruthy();
  });
});

describe('checkWebsite', () => {
  it('rejects blocked targets before any request', async () => {
    await expect(checkWebsite('http://127.0.0.1')).rejects.toBeInstanceOf(BlockedError);
  });
  it('refuses when DNS resolves to a blocked address', async () => {
    const lookup = (_h, _o, cb) => cb(new BlockedError());
    await expect(checkWebsite('https://example.com', lookup)).rejects.toBeInstanceOf(BlockedError);
  });
});
