// Speed test against Cloudflare's public speed-test endpoints (CORS enabled).
// Results are approximate and depend on the device, browser, server and network.

export const TEST_SERVER = 'speed.cloudflare.com';
const BASE = `https://${TEST_SERVER}`;

export type SpeedPhase = 'idle' | 'checking' | 'latency' | 'download' | 'upload' | 'done';

export interface SpeedResult {
  pingMs: number | null;
  jitterMs: number | null;
  downloadMbps: number | null;
  uploadMbps: number | null;
  server: string | null;
  completedAt: Date | null;
}

export const emptyResult: SpeedResult = {
  pingMs: null,
  jitterMs: null,
  downloadMbps: null,
  uploadMbps: null,
  server: null,
  completedAt: null,
};

export class SpeedTestError extends Error {}

/** Mean absolute difference between consecutive latency samples (RFC 3550-style jitter). */
export function computeJitter(samples: number[]): number | null {
  if (samples.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < samples.length; i++) sum += Math.abs(samples[i] - samples[i - 1]);
  return sum / (samples.length - 1);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function toMbps(bytes: number, ms: number): number {
  return ms > 0 ? (bytes * 8) / (ms / 1000) / 1_000_000 : 0;
}

const bust = () => `&r=${Math.random().toString(36).slice(2)}`;

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
}

async function timedPing(signal: AbortSignal): Promise<{ ms: number; colo: string | null }> {
  const t0 = performance.now();
  const res = await fetch(`${BASE}/__down?bytes=0${bust()}`, { cache: 'no-store', signal });
  if (!res.ok) throw new SpeedTestError(`The test server responded with HTTP ${res.status}.`);
  await res.arrayBuffer();
  return { ms: performance.now() - t0, colo: res.headers.get('cf-meta-colo') };
}

/** Confirms the endpoint is reachable and returns its location code, if exposed. */
export async function checkEndpoint(signal: AbortSignal): Promise<string | null> {
  try {
    return (await timedPing(signal)).colo;
  } catch (e) {
    if (signal.aborted) throw e;
    if (e instanceof SpeedTestError) throw e;
    throw new SpeedTestError('Could not reach the speed test server. Check your connection or any ad blocker.');
  }
}

export async function measureLatency(signal: AbortSignal, count = 10) {
  const samples: number[] = [];
  await timedPing(signal); // warm up the connection (TLS handshake) and discard
  for (let i = 0; i < count; i++) {
    throwIfAborted(signal);
    samples.push((await timedPing(signal)).ms);
  }
  return { pingMs: median(samples), jitterMs: computeJitter(samples) };
}

/** Runs `streams` parallel workers until `durationMs` elapses; reports live Mbps via onProgress. */
async function runParallel(
  worker: (signal: AbortSignal, add: (bytes: number) => void) => Promise<void>,
  durationMs: number,
  streams: number,
  outer: AbortSignal,
  onProgress: (mbps: number) => void,
  maxBytes: number,
): Promise<number> {
  const inner = new AbortController();
  const stop = () => inner.abort();
  outer.addEventListener('abort', stop);
  const start = performance.now();
  let bytes = 0;
  const add = (n: number) => {
    bytes += n;
    const elapsed = performance.now() - start;
    // Ignore the first 300 ms in the live readout: TCP slow start makes it unrepresentative.
    if (elapsed > 300) onProgress(toMbps(bytes, elapsed));
    // Cap total data so very fast connections don't transfer gigabytes in the time window.
    if (bytes >= maxBytes) stop();
  };
  const timer = setTimeout(stop, durationMs);
  try {
    await Promise.all(
      Array.from({ length: streams }, () =>
        worker(inner.signal, add).catch((e) => {
          // Our own time-limit abort is expected; a user cancel or a real failure is not.
          if (outer.aborted || !inner.signal.aborted) throw e;
        }),
      ),
    );
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', stop);
  }
  throwIfAborted(outer);
  return toMbps(bytes, performance.now() - start);
}

export function measureDownload(signal: AbortSignal, onProgress: (mbps: number) => void) {
  return runParallel(
    async (s, add) => {
      while (!s.aborted) {
        const res = await fetch(`${BASE}/__down?bytes=25000000${bust()}`, { cache: 'no-store', signal: s });
        if (!res.ok || !res.body) throw new SpeedTestError('The download test failed.');
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          add(value.byteLength);
        }
      }
    },
    8000,
    4,
    signal,
    onProgress,
    150_000_000,
  );
}

export function measureUpload(signal: AbortSignal, onProgress: (mbps: number) => void) {
  const CHUNK = 1_000_000;
  const body = new Uint8Array(CHUNK); // zeros are fine: HTTPS payloads are not compressed by this endpoint
  return runParallel(
    async (s, add) => {
      while (!s.aborted) {
        const res = await fetch(`${BASE}/__up`, { method: 'POST', body, cache: 'no-store', signal: s });
        if (!res.ok) throw new SpeedTestError('The upload test failed.');
        await res.arrayBuffer();
        add(CHUNK); // counted only after the server acknowledged the whole chunk
      }
    },
    6000,
    3,
    signal,
    onProgress,
    50_000_000,
  );
}
