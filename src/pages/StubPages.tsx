import { Link } from 'react-router-dom';
import { PageHeader, usePageMeta } from '../components/ui';

export const TOOLS = [
  { to: '/tools/dns-lookup', name: 'DNS Lookup', desc: 'Inspect A, AAAA, MX, TXT, NS, CNAME and SOA records.' },
  { to: '/tools/speed-test', name: 'Speed Test', desc: 'Measure download, upload, ping and jitter.' },
  { to: '/tools/website-checker', name: 'Website Checker', desc: 'Check whether a site is reachable, with status and response time.' },
  { to: '/tools/privacy-check', name: 'Privacy Check', desc: 'Test for WebRTC and DNS exposure and compare VPN on/off.' },
  { to: '/tools/browser-info', name: 'Browser Info', desc: 'See what your browser reports about your device.' },
  { to: '/lookup', name: 'IP & Domain Lookup', desc: 'Investigate any IP address or domain.' },
];

export function ToolsPage() {
  usePageMeta('Network Tools — IP Tools', 'Free networking tools: DNS lookup, speed test, website checker, privacy check and browser information.');
  return (
    <>
      <PageHeader title="Network tools">Free utilities for diagnosing your connection.</PageHeader>
      <ul className="tool-grid cols-3">
        {TOOLS.map((t) => (
          <li key={t.to}>
            <Link to={t.to} className="tool-card">
              <strong>{t.name}</strong>
              <span>{t.desc}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function NotFoundPage() {
  usePageMeta('Page not found — IP Tools', 'Page not found.');
  return (
    <>
      <PageHeader title="Page not found" />
      <Link to="/" className="text-link">
        ← Back to My IP
      </Link>
    </>
  );
}
