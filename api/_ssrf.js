// SSRF protection helpers for server-side requests to user-supplied URLs.
// Files prefixed with "_" are not deployed as Vercel functions.
import dns from 'node:dns';
import net from 'node:net';

const blocked = new net.BlockList();
const v4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, includes cloud metadata 169.254.169.254
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
for (const [a, p] of v4) blocked.addSubnet(a, p, 'ipv4');
const v6 = [
  ['::', 128], ['::1', 128],
  ['64:ff9b::', 96], // NAT64: can embed internal IPv4 addresses
  ['100::', 64], ['2001:db8::', 32],
  ['2002::', 16], // 6to4: embeds an arbitrary IPv4 address
  ['fc00::', 7], // unique local (includes fd00:ec2::254 metadata)
  ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
];
for (const [a, p] of v6) blocked.addSubnet(a, p, 'ipv6');

export class BlockedError extends Error {
  constructor(message = 'This destination is not allowed.') {
    super(message);
    this.code = 'EBLOCKED';
  }
}

/** Expand "::ffff:a.b.c.d" / "::ffff:abcd:ef01" (IPv4-mapped) into dotted IPv4, else null. */
function unmapV4(ip) {
  const dotted = ip.match(/^(?:0{0,4}:){0,5}(?:ffff:)(\d+\.\d+\.\d+\.\d+)$/i);
  if (dotted) return dotted[1];
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const hi = parseInt(hex[1], 16);
    const lo = parseInt(hex[2], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** True if the address is non-public, malformed, or otherwise must not be contacted. */
export function isBlockedAddress(address) {
  const ip = String(address).replace(/^\[|\]$/g, '').split('%')[0];
  const family = net.isIP(ip);
  if (family === 0) return true;
  if (family === 4) return blocked.check(ip, 'ipv4');
  const mapped = unmapV4(ip);
  if (mapped) return blocked.check(mapped, 'ipv4');
  return blocked.check(ip, 'ipv6');
}

const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/** Parses user input into a URL object, or throws BlockedError / TypeError-like Error with a user message. */
export function parseTarget(input) {
  let s = String(input ?? '').trim();
  if (!s) throw new Error('Enter a website URL or domain name.');
  if (s.length > 2048) throw new Error('That URL is too long.');
  if (/\s/.test(s)) throw new Error('The URL must not contain spaces.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  let url;
  try {
    url = new URL(s);
  } catch {
    throw new Error('That is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs are supported.');
  }
  if (url.username || url.password) throw new Error('URLs with credentials are not supported.');
  assertAllowedDestination(url);
  return url;
}

/** Throws BlockedError if the URL's port or literal host is not allowed. DNS-resolved hosts are checked in safeLookup. */
export function assertAllowedDestination(url) {
  if (!ALLOWED_PORTS.has(url.port)) throw new BlockedError('That port is not allowed.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (net.isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedError();
    return;
  }
  if (!host.includes('.') || BLOCKED_SUFFIXES.some((x) => host.endsWith(x))) throw new BlockedError();
}

/**
 * dns.lookup replacement used as the `lookup` option of http(s).request.
 * The connection uses exactly the addresses validated here, which prevents DNS-rebinding
 * between a separate "check" resolution and the actual connection.
 */
export function safeLookup(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addrs) => {
    if (err) return callback(err);
    if (!addrs.length || addrs.some((a) => isBlockedAddress(a.address))) {
      return callback(new BlockedError());
    }
    if (options && options.all) return callback(null, addrs);
    return callback(null, addrs[0].address, addrs[0].family);
  });
}
