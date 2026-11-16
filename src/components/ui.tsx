import { useEffect, type ReactNode } from 'react';
import { Icon } from './Icon';
import type { Availability } from '../hooks/useConnection';
import type { PrivacyStatus } from '../services/privacyService';

function setHead(selector: string, create: () => HTMLElement, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

/** Sets the title, description, Open Graph tags and canonical URL for the current page. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    const meta = (key: 'name' | 'property', name: string, value: string) =>
      setHead(`meta[${key}="${name}"]`, () => {
        const m = document.createElement('meta');
        m.setAttribute(key, name);
        return m;
      }, 'content', value);
    meta('name', 'description', description);
    meta('property', 'og:title', title);
    meta('property', 'og:description', description);
    const url = window.location.origin + window.location.pathname;
    meta('property', 'og:url', url);
    setHead('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.rel = 'canonical';
      return l;
    }, 'href', url);
  }, [title, description]);
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children && <p className="subtitle">{children}</p>}
    </header>
  );
}

export function InfoCard({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`info-card ${className}`.trim()} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode | null | undefined;
  mono?: boolean;
}) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="info-row">
      <dt>{label}</dt>
      <dd className={`${mono ? 'mono' : ''}${missing ? ' unavailable' : ''}`}>
        {missing ? 'Unavailable' : value}
      </dd>
    </div>
  );
}

const statusText: Record<Availability, string> = {
  checking: 'Checking…',
  available: 'Available',
  unavailable: 'Not detected',
};

/** Status shown with an icon and text, never colour alone. */
export function StatusIndicator({ label, status }: { label: string; status: Availability }) {
  const icon = status === 'available' ? '✓' : status === 'unavailable' ? '–' : '…';
  return (
    <li className={`status status-${status}`}>
      <span aria-hidden="true" className="status-icon">
        {icon}
      </span>
      <span>
        {label}: <strong>{statusText[status]}</strong>
      </span>
    </li>
  );
}

export function ErrorMessage({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error" role="alert">
      <p>{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-danger btn-sm" onClick={onRetry}>
          <Icon name="refresh" />
          Retry
        </button>
      )}
    </div>
  );
}

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span className="skeleton" style={{ width }} aria-hidden="true" />;
}


const resultText: Record<PrivacyStatus, { icon: string; text: string }> = {
  none: { icon: '✓', text: 'No issue detected' },
  potential: { icon: '!', text: 'Potential exposure detected' },
  unknown: { icon: '?', text: 'Unable to verify' },
};

/** Privacy result badge: icon and text, never colour alone. */
export function ResultStatus({ status }: { status: PrivacyStatus }) {
  const r = resultText[status];
  return (
    <p className={`result-status result-${status}`} role="status">
      <span className="status-icon" aria-hidden="true">{r.icon}</span>
      <strong>{r.text}</strong>
    </p>
  );
}
