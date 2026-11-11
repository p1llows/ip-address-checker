import { useRef, useState } from 'react';
import { CopyButton } from './components/CopyButton';
import { IpAddressDisplay } from './components/IpAddressDisplay';
import { fetchPublicIp } from './services/ipService';

export default function App() {
  const [ip, setIp] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);

  const check = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      setIp(await fetchPublicIp());
      setCheckedAt(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <main className="card">
      <h1>IP Address Checker</h1>
      <p className="subtitle">
        Find your current public IP address — handy for troubleshooting connectivity, firewall
        rules, and IP whitelisting.
      </p>

      <div className="result">
        <IpAddressDisplay ip={ip} />
        {ip && <CopyButton text={ip} />}
      </div>

      {checkedAt && !error && <p className="meta">Last checked: {checkedAt.toLocaleString()}</p>}

      <button
        type="button"
        className="btn btn-primary"
        onClick={check}
        disabled={loading}
        aria-busy={loading}
      >
        {loading && <span className="spinner" aria-hidden="true" />}
        {loading ? 'Checking…' : 'Check My IP Address'}
      </button>

      {error && (
        <div className="error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-link" onClick={check} disabled={loading}>
            Retry
          </button>
        </div>
      )}
    </main>
  );
}
