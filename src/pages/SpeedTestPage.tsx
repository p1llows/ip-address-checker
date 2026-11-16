import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { SpeedGauge, SpeedSteps } from '../components/SpeedGauge';
import { ErrorMessage, PageHeader, usePageMeta } from '../components/ui';
import {
  checkEndpoint, emptyResult, measureDownload, measureLatency, measureUpload, SpeedTestError,
  TEST_SERVER, type SpeedPhase, type SpeedResult,
} from '../services/speedTestService';

const PHASE_TEXT: Record<SpeedPhase, string> = {
  idle: 'Ready',
  checking: 'Checking the test server…',
  latency: 'Measuring latency…',
  download: 'Measuring download speed…',
  upload: 'Measuring upload speed…',
  done: 'Test complete',
};

const fmt = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));

export default function SpeedTestPage() {
  usePageMeta('Internet Speed Test — IP Tools', 'Measure your approximate download speed, upload speed, ping and jitter.');
  const [phase, setPhase] = useState<SpeedPhase>('idle');
  const [live, setLive] = useState<number | null>(null);
  const [result, setResult] = useState<SpeedResult>(emptyResult);
  const [error, setError] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const lastTick = useRef(0);
  const running = phase !== 'idle' && phase !== 'done';

  useEffect(() => () => ctl.current?.abort(), []);

  // Progress callbacks fire per network chunk; render at most ~10 times a second.
  const onProgress = (mbps: number) => {
    const now = performance.now();
    if (now - lastTick.current < 100) return;
    lastTick.current = now;
    setLive(mbps);
  };

  const start = async () => {
    const c = new AbortController();
    ctl.current = c;
    setResult(emptyResult);
    setError(null);
    setCancelled(false);
    setLive(null);
    const patch = (p: Partial<SpeedResult>) => setResult((r) => ({ ...r, ...p }));
    try {
      setPhase('checking');
      const colo = await checkEndpoint(c.signal);
      patch({ server: `${TEST_SERVER}${colo ? ` (Cloudflare ${colo})` : ''}` });

      setPhase('latency');
      patch(await measureLatency(c.signal));

      setPhase('download');
      setLive(0);
      const down = await measureDownload(c.signal, onProgress);
      patch({ downloadMbps: down });
      setLive(down);

      setPhase('upload');
      setLive(0);
      const up = await measureUpload(c.signal, onProgress);
      patch({ uploadMbps: up });
      setLive(up);

      patch({ completedAt: new Date() });
      setPhase('done');
    } catch (e) {
      setLive(null);
      setPhase('idle');
      if (c.signal.aborted) {
        setCancelled(true);
      } else {
        setError(
          e instanceof SpeedTestError
            ? e.message
            : 'The test failed because of a network error. Check your connection and try again.',
        );
      }
    } finally {
      if (ctl.current === c) ctl.current = null;
    }
  };

  // Dial content: live value while transferring; download result once finished.
  const dialValue = phase === 'done' ? result.downloadMbps : live;
  const dialCaption =
    phase === 'download' ? 'Download' : phase === 'upload' ? 'Upload' : phase === 'done' ? 'Download' : running ? 'Testing' : 'Mbps';
  const dialUnit = 'Mbps';

  const metrics: Array<[string, string, string, SpeedPhase | null]> = [
    ['Download', fmt(result.downloadMbps), 'Mbps', 'download'],
    ['Upload', fmt(result.uploadMbps), 'Mbps', 'upload'],
    ['Ping', fmt(result.pingMs, 0), 'ms', 'latency'],
    ['Jitter', fmt(result.jitterMs, 1), 'ms', 'latency'],
  ];

  return (
    <>
      <PageHeader title="Internet speed test">
        Measure approximate download, upload, latency and jitter.
      </PageHeader>

      <section className="speed-panel" aria-label="Speed test">
        <div className="speed-left">
          <SpeedGauge phase={phase} value={dialValue} unit={dialUnit} caption={dialCaption} />
          <SpeedSteps phase={phase} />
        </div>

        <div className="speed-right">
          <div className="hero-actions">
            {running ? (
              <button type="button" className="btn btn-danger" onClick={() => ctl.current?.abort()}>
                <Icon name="x" />
                Cancel test
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void start()}>
                <Icon name={phase === 'done' ? 'refresh' : 'play'} />
                {phase === 'done' ? 'Run again' : 'Start test'}
              </button>
            )}
            <span className="meta" role="status">
              {running && <span className="spinner" aria-hidden="true" />}{' '}
              {cancelled ? 'Test cancelled' : PHASE_TEXT[phase]}
            </span>
          </div>

          {error && <ErrorMessage message={error} onRetry={() => void start()} />}

          <dl className="metrics">
            {metrics.map(([label, value, unit, p]) => {
              const active = running && phase === p;
              const hasValue = value !== '—';
              return (
                <div className={`metric${active ? ' metric-active' : ''}`} key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {/* key restarts the fade-in each time a new value arrives */}
                    <span key={value} className={`mono metric-value${hasValue ? ' metric-new' : ''}`}>{value}</span>{' '}
                    <span className="meta">{hasValue ? unit : ''}</span>
                  </dd>
                </div>
              );
            })}
          </dl>

          <p className="note">
            {result.server && <>Test server: <span className="mono">{result.server}</span>. </>}
            {result.completedAt && <>Completed {result.completedAt.toLocaleString()}.</>}
          </p>
        </div>
      </section>

      <p className="note">
        Results are approximate measurements between your browser and the test server above, not a
        guaranteed ISP speed. Accuracy depends on your device, browser, the server and current network
        conditions. The test transfers up to about 150 MB down and 50 MB up; on a metered
        connection, avoid running it. Ping is the median of 10 round trips and jitter is the average
        change between consecutive pings.
      </p>
    </>
  );
}
