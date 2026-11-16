import { Link } from 'react-router-dom';
import { CopyButton } from '../components/CopyButton';
import { Icon } from '../components/Icon';
import { ErrorMessage, InfoCard, InfoRow, PageHeader, Skeleton, StatusIndicator, usePageMeta } from '../components/ui';
import { useConnection } from '../hooks/useConnection';

function IpLine({ label, ip, loading, emptyText }: { label: string; ip: string | null; loading: boolean; emptyText: string }) {
  return (
    <div className="ip-line">
      <span className="ip-label">{label}</span>
      {ip ? (
        <>
          <output className="ip-display" aria-label={`Your public ${label} address`}>
            {ip}
          </output>
          <CopyButton text={ip} label={`${label} address`} />
        </>
      ) : loading ? (
        <Skeleton width="min(16rem, 100%)" />
      ) : (
        <span className="unavailable">{emptyText}</span>
      )}
    </div>
  );
}

/** OpenStreetMap zoom level that shows roughly the uncertainty radius. */
const zoomFor = (km: number | null) => (km === null ? 10 : km <= 10 ? 12 : km <= 30 ? 11 : km <= 100 ? 9 : 7);

const quickTools = [
  { to: '/lookup', name: 'IP Lookup', desc: 'Investigate any IP address or domain.' },
  { to: '/tools/dns-lookup', name: 'DNS Lookup', desc: 'Inspect DNS records for a domain.' },
  { to: '/tools/speed-test', name: 'Speed Test', desc: 'Measure download, upload and latency.' },
  { to: '/tools/privacy-check', name: 'Privacy Check', desc: 'Check for IP and WebRTC exposure.' },
];

export default function HomePage() {
  usePageMeta(
    "What's My IP Address? — IP Tools",
    'See your public IPv4 and IPv6 address, ISP, ASN and approximate location.',
  );
  const c = useConnection();
  const { info, loading } = c;
  const coords =
    info && info.latitude !== null && info.longitude !== null
      ? `${info.latitude.toFixed(3)}, ${info.longitude.toFixed(3)}`
      : null;
  const mapUrl =
    info && coords
      ? `https://www.openstreetmap.org/?mlat=${info.latitude}&mlon=${info.longitude}#map=${zoomFor(info.accuracyKm)}/${info.latitude}/${info.longitude}`
      : null;

  return (
    <>
      <PageHeader title="What's my IP address?">
        Your public IP address, as seen by websites you visit.
      </PageHeader>

      <section className="hero" aria-label="Public IP address" aria-busy={loading}>
        <IpLine label="IPv4" ip={c.ipv4} loading={loading} emptyText="Not detected" />
        <IpLine label="IPv6" ip={c.ipv6} loading={loading} emptyText="Not detected (common on IPv4-only networks)" />
        {c.error && <ErrorMessage message={c.error} onRetry={c.refresh} />}
        <div className="hero-actions">
          <button type="button" className="btn btn-primary" onClick={c.refresh} disabled={loading}>
            {loading ? <span className="spinner" aria-hidden="true" /> : <Icon name="refresh" />}
            {loading ? 'Checking…' : 'Refresh'}
          </button>
          {c.checkedAt && !c.error && (
            <span className="meta">Last checked: {c.checkedAt.toLocaleString()}</span>
          )}
        </div>
      </section>

      <div className="grid">
        <InfoCard title="Connection overview">
          {c.infoError ? (
            <ErrorMessage message={c.infoError} onRetry={c.refresh} />
          ) : loading && !info ? (
            <Skeleton />
          ) : (
            <dl>
              <InfoRow label="ISP" value={info?.isp} />
              <InfoRow label="Organization" value={info?.organization} />
              <InfoRow label="ASN" value={info?.asn} mono />
              <InfoRow label="IP version" value={info?.version} />
              <InfoRow label="Timezone" value={info?.timezone} />
            </dl>
          )}
        </InfoCard>

        <InfoCard title="Estimated location">
          {c.infoError ? (
            <p className="unavailable">Unavailable</p>
          ) : loading && !info ? (
            <Skeleton />
          ) : (
            <>
              <dl>
                <InfoRow label="Country" value={info?.country} />
                <InfoRow label="Region" value={info?.region} />
                <InfoRow label="City" value={info?.city} />
                <InfoRow label="Coordinates" value={coords} mono />
                <InfoRow label="Likely within" value={info?.accuracyKm != null ? `about ${Math.ceil(info.accuracyKm)} km` : null} />
                <InfoRow label="Confidence" value={info?.confidence ? info.confidence[0].toUpperCase() + info.confidence.slice(1) : null} />
              </dl>
              {mapUrl && (
                <a className="text-link" href={mapUrl} target="_blank" rel="noopener noreferrer">
                  Open this area in OpenStreetMap ↗
                </a>
              )}
              <p className="note">
                {info?.confidenceNote ?? 'No location estimate is available.'} IP-based location is never exact: it often points to your ISP's network, not your street.
              </p>
            </>
          )}
        </InfoCard>

        <InfoCard title="Connection status" className="wide">
          <ul className="status-list">
            <StatusIndicator label="IPv4" status={c.ipv4Status} />
            <StatusIndicator label="IPv6" status={c.ipv6Status} />
            <StatusIndicator
              label="Connection details"
              status={loading ? 'checking' : info ? 'available' : 'unavailable'}
            />
          </ul>
          <p className="note">
            Detecting your IP only shows that these lookup services were reachable. It does not
            prove your connection is healthy.
          </p>
        </InfoCard>
      </div>

      <section aria-labelledby="quick-tools">
        <h2 id="quick-tools">Quick tools</h2>
        <ul className="tool-grid">
          {quickTools.map((t) => (
            <li key={t.name}>
              <Link to={t.to} className="tool-card">
                <strong>{t.name}</strong>
                <span>{t.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="prose" aria-labelledby="about-ip">
        <h2 id="about-ip">About public IP addresses</h2>
        <p>
          A public IP address identifies your network on the internet. Your ISP assigns it, it may
          change over time, and it is shared by every device behind your router. Many networks now
          offer IPv6 alongside IPv4. See <Link to="/about">About</Link> for how your data is handled.
        </p>
      </section>
    </>
  );
}
