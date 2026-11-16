import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import { Icon } from '../components/Icon';
import { ErrorMessage, PageHeader, Skeleton, usePageMeta } from '../components/ui';
import { classifyInput } from '../lib/validate';
import { DNS_RECORD_TYPES, lookupRecords, type DnsResult } from '../services/dnsService';

const DESCRIPTIONS: Record<string, string> = {
  A: 'IPv4 addresses',
  AAAA: 'IPv6 addresses',
  MX: 'Mail exchange servers',
  TXT: 'Text records',
  NS: 'Authoritative name servers',
  CNAME: 'Canonical name',
  SOA: 'Start of authority',
};

export default function DnsLookupPage() {
  usePageMeta('DNS Lookup Tool — IP Tools', 'Look up A, AAAA, MX, TXT, NS, CNAME and SOA DNS records for any domain.');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DnsResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const runId = useRef(0);

  const run = async (raw: string) => {
    const id = ++runId.current;
    setError(null);
    const c = classifyInput(raw);
    if (!c.ok) {
      setResult(null);
      setError(c.error);
      return;
    }
    if (c.kind !== 'domain') {
      setResult(null);
      setError('Enter a domain name here. To look up an IP address, use the Lookup page.');
      return;
    }
    setInput(c.value);
    setLoading(true);
    try {
      const r = await lookupRecords(c.value);
      if (id !== runId.current) return;
      setResult(r);
      setCheckedAt(new Date());
    } catch (e) {
      if (id !== runId.current) return;
      setResult(null);
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      if (id === runId.current) setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void run(input);
  };

  const total = result ? DNS_RECORD_TYPES.reduce((n, t) => n + result.records[t].length, 0) : 0;

  return (
    <>
      <PageHeader title="DNS lookup">
        Inspect the DNS records of a domain, resolved through Cloudflare's DNS-over-HTTPS.
      </PageHeader>

      <form className="search" onSubmit={onSubmit} noValidate>
        <label htmlFor="dns-q" className="sr-only">Domain name</label>
        <input
          id="dns-q"
          className="search-input mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="example.com"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={300}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'dns-error' : undefined}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="search" />}
          {loading ? 'Looking up…' : 'Look up'}
        </button>
      </form>

      <div aria-live="polite" className="results">
        {error && (
          <div id="dns-error">
            <ErrorMessage message={error} onRetry={error.includes('Lookup page') ? undefined : () => void run(input)} />
          </div>
        )}
        {loading && !result && <Skeleton />}

        {result && (
          <>
            <p className="meta">
              Results for <strong className="mono">{result.domain}</strong>
              {checkedAt && <> · retrieved {checkedAt.toLocaleTimeString()}</>}
              {' · '}TTL values are as reported by the resolver (cached values count down).
            </p>
            {result.nxdomain && (
              <p className="error-note" role="status">
                This domain does not exist (NXDOMAIN).
              </p>
            )}
            {!result.nxdomain && total === 0 && (
              <p className="unavailable">No records of the supported types were found for this domain.</p>
            )}
            {DNS_RECORD_TYPES.map((type) => {
              const rows = result.records[type];
              const err = result.errors[type];
              return (
                <section key={type} className="info-card" aria-labelledby={`h-${type}`}>
                  <h2 id={`h-${type}`}>
                    {type} <span className="muted-inline">— {DESCRIPTIONS[type]}</span>
                  </h2>
                  {err ? (
                    <ErrorMessage message={`${type} lookup failed: ${err}`} onRetry={() => void run(result.domain)} />
                  ) : rows.length === 0 ? (
                    <p className="unavailable">No {type} records</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th scope="col">Value</th>
                            {type === 'MX' && <th scope="col">Priority</th>}
                            <th scope="col">TTL</th>
                            <th scope="col"><span className="sr-only">Copy</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={`${r.value}-${i}`}>
                              <td className="mono wrap">{r.value}</td>
                              {type === 'MX' && <td>{r.priority ?? '—'}</td>}
                              <td>{r.ttl !== null ? `${r.ttl}s` : '—'}</td>
                              <td><CopyButton text={r.value} label={`${type} record value`} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
            <p className="note">
              Want to see where an address points? Use <Link to="/lookup" className="text-link">IP & domain lookup</Link>.
            </p>
          </>
        )}
      </div>
    </>
  );
}
