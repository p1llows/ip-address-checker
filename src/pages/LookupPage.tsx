import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CopyButton } from '../components/CopyButton';
import { Icon } from '../components/Icon';
import { LocationPanel } from '../components/LocationPanel';
import { ErrorMessage, InfoCard, InfoRow, PageHeader, Skeleton, usePageMeta } from '../components/ui';
import {
  addHistory,
  clearHistory,
  loadHistory,
  removeHistory,
  type HistoryEntry,
} from '../lib/history';
import { classifyInput, reservedReason } from '../lib/validate';
import { resolveDomain, type ResolvedAddresses } from '../services/dnsService';
import { fetchIpInfo, type IpInfo } from '../services/ipInfoService';


type Result =
  | { type: 'ip'; info: IpInfo; fromDomain?: string }
  | { type: 'reserved'; ip: string; reason: string }
  | { type: 'domain'; resolved: ResolvedAddresses };

function IpResult({ info }: { info: IpInfo }) {
  return (
    <div className="grid">
      <InfoCard title="IP information">
        <dl>
          <InfoRow label="IP address" value={info.ip} mono />
          <InfoRow label="IP version" value={info.version} />
          <InfoRow label="ISP" value={info.isp} />
          <InfoRow label="Organization" value={info.organization} />
          <InfoRow label="ASN" value={info.asn} mono />
          <InfoRow label="Timezone" value={info.timezone} />
        </dl>
        <div>
          <CopyButton text={info.ip} label="IP address" />
        </div>
      </InfoCard>
      <InfoCard title="Location details">
        <dl>
          <InfoRow label="Country" value={info.country} />
          <InfoRow label="Region" value={info.region} />
          <InfoRow label="City" value={info.city} />
          <InfoRow label="Postal code" value={info.postalCode} />
          <InfoRow
            label="Coordinates"
            value={info.latitude !== null && info.longitude !== null ? `${info.latitude.toFixed(3)}, ${info.longitude.toFixed(3)}` : null}
            mono
          />
          <InfoRow label="Accuracy" value={info.accuracyKm !== null ? `within about ${Math.ceil(info.accuracyKm)} km` : null} />
        </dl>
      </InfoCard>
      <LocationPanel info={info} />
    </div>
  );
}

export default function LookupPage() {
  usePageMeta(
    'IP Address Lookup — IP Tools',
    'Look up the ISP, ASN and approximate location of any IP address or domain.',
  );
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [confirmClear, setConfirmClear] = useState(false);
  const runId = useRef(0);
  const resultRef = useRef<HTMLDivElement>(null);

  const lookupIp = useCallback(
    async (ip: string, kind: 'ipv4' | 'ipv6', fromDomain?: string): Promise<Result> => {
      const reason = reservedReason(kind, ip);
      if (reason) return { type: 'reserved', ip, reason };
      return { type: 'ip', info: await fetchIpInfo(ip), fromDomain };
    },
    [],
  );

  /** Shared runner: handles loading, stale responses and errors. */
  const execute = useCallback(async (task: () => Promise<Result>, onDone?: () => void) => {
    const id = ++runId.current;
    setError(null);
    setLoading(true);
    setRetry(() => () => void execute(task, onDone));
    try {
      const r = await task();
      if (id !== runId.current) return;
      setResult(r);
      onDone?.();
    } catch (e) {
      if (id !== runId.current) return;
      setResult(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (id === runId.current) setLoading(false);
    }
  }, []);

  const run = useCallback(
    (raw: string) => {
      const c = classifyInput(raw);
      if (!c.ok) {
        runId.current++;
        setLoading(false);
        setResult(null);
        setRetry(null);
        setError(c.error);
        return;
      }
      setInput(c.value);
      void execute(
        async () =>
          c.kind === 'domain'
            ? { type: 'domain', resolved: await resolveDomain(c.value) }
            : lookupIp(c.value, c.kind),
        () => setHistory((h) => addHistory(h, c.value)),
      );
    },
    [execute, lookupIp],
  );

  const inspectResolved = (ip: string, kind: 'ipv4' | 'ipv6', domain: string) =>
    void execute(() => lookupIp(ip, kind, domain));

  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(input);
  };

  return (
    <>
      <PageHeader title="IP & domain lookup">
        Look up the network and approximate location of any public IP address or domain.
      </PageHeader>

      <form className="search" onSubmit={onSubmit} noValidate>
        <label htmlFor="q" className="sr-only">
          IP address or domain
        </label>
        <input
          id="q"
          className="search-input mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="8.8.8.8, 2606:4700:4700::1111 or example.com"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={300}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'q-error' : undefined}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="search" />}
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </form>
      <p className="note examples">
        Try:{' '}
        {['8.8.8.8', '1.1.1.1', 'google.com', 'cloudflare.com'].map((ex) => (
          <button key={ex} type="button" className="chip" onClick={() => run(ex)} disabled={loading}>
            {ex}
          </button>
        ))}
      </p>

      <div aria-live="polite" ref={resultRef} tabIndex={-1} className="results">
        {error && (
          <div id="q-error">
            <ErrorMessage message={error} onRetry={retry ?? undefined} />
          </div>
        )}
        {loading && !result && <Skeleton />}

        {result?.type === 'reserved' && (
          <InfoCard title={result.ip}>
            <p>
              This is a <strong>{result.reason}</strong> address. It isn't publicly routable on the
              internet, so it has no ISP, ASN or location to look up.
            </p>
          </InfoCard>
        )}

        {result?.type === 'ip' && (
          <>
            {result.fromDomain && (
              <p className="note">
                Showing one of the addresses that {result.fromDomain} resolves to.
              </p>
            )}
            <IpResult info={result.info} />
          </>
        )}

        {result?.type === 'domain' && (
          <InfoCard title={`Addresses for ${result.resolved.domain}`}>
            {result.resolved.ipv4.length + result.resolved.ipv6.length === 0 ? (
              <p className="unavailable">
                No A or AAAA records were found. The domain may not exist or may not point to an IP
                address.
              </p>
            ) : (
              (
                [
                  ['IPv4', 'ipv4', result.resolved.ipv4],
                  ['IPv6', 'ipv6', result.resolved.ipv6],
                ] as const
              ).map(([label, kind, list]) => (
                <div key={kind}>
                  <h3>{label}</h3>
                  {list.length === 0 ? (
                    <p className="unavailable">None</p>
                  ) : (
                    <ul className="addr-list">
                      {list.map((ip) => (
                        <li key={ip}>
                          <span className="mono">{ip}</span>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => inspectResolved(ip, kind, result.resolved.domain)}
                            disabled={loading}
                            aria-label={`Inspect ${ip}`}
                          >
                            Inspect
                          </button>
                          <CopyButton text={ip} label={`${label} address ${ip}`} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))
            )}
          </InfoCard>
        )}
      </div>

      <section aria-labelledby="history-h">
        <div className="section-head">
          <h2 id="history-h">Recent lookups</h2>
          {history.length > 0 &&
            (confirmClear ? (
              <span className="confirm" role="alertdialog" aria-label="Confirm clearing history">
                Clear all history?
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    setHistory(clearHistory());
                    setConfirmClear(false);
                  }}
                >
                  Yes, clear
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirmClear(true)}>
                Clear all
              </button>
            ))}
        </div>
        {history.length === 0 ? (
          <p className="note">No lookups yet. History is stored only in this browser.</p>
        ) : (
          <ul className="history">
            {history.map((h) => (
              <li key={h.query}>
                <button
                  type="button"
                  className="history-q mono"
                  onClick={() => run(h.query)}
                  disabled={loading}
                >
                  {h.query}
                </button>
                <time className="meta" dateTime={new Date(h.at).toISOString()}>
                  {new Date(h.at).toLocaleString()}
                </time>
                <button
                  type="button"
                  className="btn btn-quiet btn-sm"
                  onClick={() => setHistory(removeHistory(history, h.query))}
                  aria-label={`Remove ${h.query} from history`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
