import { useState } from 'react';
import { CopyButton } from '../components/CopyButton';
import { Icon } from '../components/Icon';
import { PageHeader, usePageMeta } from '../components/ui';
import { getBrowserInfo } from '../lib/browserInfo';

export default function BrowserInfoPage() {
  usePageMeta('Browser Information — IP Tools', 'See your browser, screen, language, timezone and capabilities.');
  const [items, setItems] = useState(() => getBrowserInfo());
  const all = items.map((i) => `${i.label}: ${i.value}`).join('\n');

  return (
    <>
      <PageHeader title="Browser information">
        What your browser reports about itself. This is read locally and never sent anywhere or stored.
      </PageHeader>
      <div className="hero-actions">
        <button type="button" className="btn btn-primary" onClick={() => setItems(getBrowserInfo())}>
          <Icon name="refresh" />
          Refresh
        </button>
        <CopyButton text={all} label="all browser information" />
      </div>
      <div className="info-card">
        <dl>
          {items.map((i) => (
            <div className="info-row copy-row" key={i.label}>
              <dt>{i.label}</dt>
              <dd className="mono wrap">{i.value}</dd>
              <CopyButton text={i.value} label={i.label} />
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
