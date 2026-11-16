import { useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { ErrorMessage, InfoCard, InfoRow, PageHeader, Skeleton, usePageMeta } from '../components/ui';
import { checkWebsite, type WebsiteCheck } from '../services/websiteCheckService';

const STATUS_TEXT = {
  available: { icon: '✓', text: 'Available' },
  unavailable: { icon: '✕', text: 'Unavailable' },
  inconclusive: { icon: '?', text: 'Inconclusive' },
} as const;

export default function WebsiteCheckerPage() {
  usePageMeta('Website Availability Checker — IP Tools', 'Check whether a website or server is reachable and see its HTTP status and response time.');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WebsiteCheck | null>(null);
  const runId = useRef(0);

  const run = async () => {
    const id = ++runId.current;
    if (!input.trim()) {
      setError('Enter a website URL or domain name.');
      setResult(null);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const r = await checkWebsite(input);
      if (id === runId.current) setResult(r);
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
    void run();
  };
  const s = result ? STATUS_TEXT[result.status] : null;

  return (
    <>
      <PageHeader title="Website availability checker">
        Check whether a website responds. The request is made from our server, not your browser.
      </PageHeader>

      <form className="search" onSubmit={onSubmit} noValidate>
        <label htmlFor="web-q" className="sr-only">Website URL or domain</label>
        <input
          id="web-q"
          className="search-input mono"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="example.com or https://example.com/path"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={2048}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'web-error' : undefined}
        />
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="search" />}
          {loading ? 'Checking…' : 'Check'}
        </button>
      </form>

      <div aria-live="polite" className="results">
        {error && (
          <div id="web-error">
            <ErrorMessage message={error} onRetry={input.trim() ? () => void run() : undefined} />
          </div>
        )}
        {loading && !result && <Skeleton />}
        {result && s && (
          <InfoCard title="Result">
            <p className={`result-status web-${result.status}`}>
              <span className="status-icon" aria-hidden="true">{s.icon}</span>
              <strong>{s.text}</strong>
            </p>
            {result.message && <p className="note">{result.message}</p>}
            <dl>
              <InfoRow label="HTTP status" value={result.httpStatus !== null ? String(result.httpStatus) : null} mono />
              <InfoRow label="Response time" value={`${result.responseTimeMs} ms`} mono />
              <InfoRow label="Final URL" value={result.finalUrl} mono />
              <InfoRow label="Redirects followed" value={String(result.redirects)} />
              <InfoRow label="Checked at" value={new Date(result.checkedAt).toLocaleString()} />
            </dl>
            <p className="note">
              This reflects reachability from our server at one moment. A site can be reachable here
              but blocked or slow for you, and the reverse.
            </p>
          </InfoCard>
        )}
      </div>
    </>
  );
}
