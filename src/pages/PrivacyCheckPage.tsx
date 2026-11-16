import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { ErrorMessage, InfoCard, PageHeader, ResultStatus, Skeleton, usePageMeta } from '../components/ui';
import { useConnection } from '../hooks/useConnection';
import {
  analyzeCandidates, compareExpectedResolver, compareSnapshots, gatherWebRtcCandidates, loadBaseline,
  runDnsTest, saveBaseline, type ConnectionSnapshot, type DnsTestResult, type WebRtcAnalysis,
} from '../services/privacyService';

const KIND_TEXT = { public: 'Public', private: 'Private / local', mdns: 'Hidden (.local name)' } as const;

function WebRtcSection({ publicIps }: { publicIps: string[] }) {
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<WebRtcAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof RTCPeerConnection !== 'undefined';

  const run = async () => {
    setBusy(true);
    setError(null);
    setAnalysis(null);
    try {
      setAnalysis(analyzeCandidates(await gatherWebRtcCandidates(), publicIps));
    } catch {
      setError(
        supported
          ? 'The WebRTC test could not run. Your browser or an extension may be blocking it.'
          : 'This browser does not support WebRTC, so this test is unavailable.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <InfoCard title="WebRTC leak test">
      <p className="note">
        WebRTC lets websites discover network addresses through your browser, which can reveal an IP
        address your VPN is meant to hide. The test asks Cloudflare's STUN server for your public
        address, the same way a video-call site would.
      </p>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy || !supported}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="play" />}
          {busy ? 'Testing…' : 'Run WebRTC test'}
        </button>
      </div>
      {!supported && <p className="unavailable">Not supported in this browser.</p>}
      {error && <ErrorMessage message={error} />}
      {analysis && (
        <>
          <ResultStatus status={analysis.status} />
          <p>{analysis.explanation}</p>
          {analysis.addresses.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Address</th><th scope="col">Type</th><th scope="col">Kind</th><th scope="col">Matches detected IP</th></tr>
                </thead>
                <tbody>
                  {analysis.addresses.map((a) => (
                    <tr key={a.address}>
                      <td className="mono wrap">{a.address}</td>
                      <td>{a.candidateType}</td>
                      <td>{KIND_TEXT[a.kind]}</td>
                      <td>{a.kind === 'public' ? (a.matchesPublicIp ? 'Yes' : 'No') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </InfoCard>
  );
}

function DnsSection({ onResult }: { onResult: (r: DnsTestResult) => void }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<DnsTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expected, setExpected] = useState('');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const run = async () => {
    const c = new AbortController();
    ctl.current = c;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await runDnsTest(c.signal);
      setResult(r);
      onResult(r);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : 'The DNS test failed.');
    } finally {
      setBusy(false);
    }
  };

  const verdict = result ? compareExpectedResolver(result.resolvers, expected) : null;

  return (
    <InfoCard title="DNS resolver check">
      <p className="note">
        Shows which DNS resolvers handled lookups from your browser, as seen by the bash.ws test
        service (via our server). A resolver run by your ISP while using a VPN can indicate a DNS
        leak, but a resolver belonging to a different organization is not proof of one.
      </p>
      <div>
        <label htmlFor="expected" className="field-label">Expected DNS provider (optional)</label>
        <input
          id="expected"
          className="search-input"
          value={expected}
          onChange={(e) => setExpected(e.target.value)}
          placeholder="e.g. your VPN provider, Cloudflare, Google"
          maxLength={60}
          autoComplete="off"
        />
      </div>
      <div>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="play" />}
          {busy ? 'Testing…' : 'Run DNS test'}
        </button>
      </div>
      {error && <ErrorMessage message={error} onRetry={() => void run()} />}
      {busy && <Skeleton />}
      {result && verdict && (
        <>
          <ResultStatus status={verdict.status} />
          <p>{verdict.explanation}</p>
          {result.resolvers.length === 0 ? (
            <p className="unavailable">No resolvers were observed.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Resolver IP</th><th scope="col">Organization</th><th scope="col">Country</th></tr>
                </thead>
                <tbody>
                  {result.resolvers.map((r) => (
                    <tr key={r.ip}>
                      <td className="mono">{r.ip}</td>
                      <td>{r.org ?? 'Unavailable'}</td>
                      <td>{r.country ?? 'Unavailable'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </InfoCard>
  );
}

function VpnSection({ current, loading, refresh }: { current: ConnectionSnapshot | null; loading: boolean; refresh: () => void }) {
  const [baseline, setBaseline] = useState<ConnectionSnapshot | null>(() => loadBaseline());
  const rows = baseline && current ? compareSnapshots(baseline, current) : null;

  return (
    <InfoCard title="VPN comparison">
      <ol className="steps">
        <li>Without your VPN, save your current connection as a baseline.</li>
        <li>Turn your VPN on, then refresh the current connection (and re-run the DNS test above if you want resolvers compared).</li>
        <li>Compare the two.</li>
      </ol>
      <div className="hero-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!current || loading}
          onClick={() => {
            if (!current) return;
            saveBaseline(current);
            setBaseline(current);
          }}
        >
          Save current connection as baseline
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />}
          {loading ? 'Refreshing…' : 'Refresh current connection'}
        </button>
        {baseline && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { saveBaseline(null); setBaseline(null); }}>
            Clear baseline
          </button>
        )}
      </div>
      <p className="note">The baseline is stored only in this browser until you clear it.</p>
      {baseline && <p className="meta">Baseline saved {new Date(baseline.savedAt).toLocaleString()}</p>}
      {rows && (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th scope="col">Property</th><th scope="col">Baseline</th><th scope="col">Now</th><th scope="col">Result</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td className="mono wrap">{r.before}</td>
                    <td className="mono wrap">{r.after}</td>
                    <td>{r.changed ? '↔ Changed' : '= Same'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            {rows[0].changed
              ? 'Your public IP changed, which is what a working VPN normally does. This does not guarantee anonymity.'
              : 'Your public IP is the same as the baseline, so traffic is probably not going through a VPN yet.'}
          </p>
        </>
      )}
    </InfoCard>
  );
}

export default function PrivacyCheckPage() {
  usePageMeta('IP and Privacy Check — IP Tools', 'Test for WebRTC and DNS exposure and compare your connection before and after using a VPN.');
  const c = useConnection();
  const [resolvers, setResolvers] = useState<string[]>([]);
  const publicIps = [c.ipv4, c.ipv6].filter((x): x is string => !!x);

  const current: ConnectionSnapshot | null =
    publicIps.length > 0 && !c.loading
      ? {
          ip: c.ipv4 ?? c.ipv6!,
          country: c.info?.country ?? null,
          isp: c.info?.isp ?? c.info?.organization ?? null,
          asn: c.info?.asn ?? null,
          resolvers,
          savedAt: Date.now(),
        }
      : null;

  return (
    <>
      <PageHeader title="IP and privacy check">
        Basic diagnostics for whether your network information may be exposed.
      </PageHeader>
      <p className="note">
        These tests give indications, not guarantees. A clean result does not prove you are anonymous
        or that a VPN is secure.
      </p>
      <p className="meta">
        Detected public IP: {c.loading ? 'checking…' : publicIps.length ? <span className="mono">{publicIps.join(' · ')}</span> : 'unavailable'}
      </p>
      <WebRtcSection publicIps={publicIps} />
      <DnsSection onResult={(r) => setResolvers(r.resolvers.map((x) => x.ip))} />
      <VpnSection current={current} loading={c.loading} refresh={c.refresh} />
    </>
  );
}
