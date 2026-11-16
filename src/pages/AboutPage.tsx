import { PageHeader, usePageMeta } from '../components/ui';

export default function AboutPage() {
  usePageMeta('About & Privacy — IP Tools', 'How IP Tools works, which services it uses and how your data is handled.');
  return (
    <>
      <PageHeader title="About & privacy">
        A lightweight networking toolkit. No account required.
      </PageHeader>
      <div className="prose">
        <h2>Data handling</h2>
        <p>
          IP Tools has no database, no accounts, no analytics and no cookies. The only data saved is
          in your own browser's local storage: your recent lookups, and a VPN comparison baseline if
          you choose to save one. You can remove both at any time from the pages that create them.
        </p>
        <p>
          Two tools send what you type to this site's server: the website checker (the URL you
          enter) and the DNS resolver check (a test id). They are not stored by the application, but
          the hosting platform may keep standard request logs.
        </p>

        <h2>External services</h2>
        <p>
          Your browser contacts these third-party services directly, and they can see your IP address:
        </p>
        <ul>
          <li><strong>ipify</strong> (api.ipify.org, api6.ipify.org) — detects your public IPv4 and IPv6 address.</li>
          <li><strong>ipwho.is, ipinfo.io, geojs.io and ipapi.co</strong> — ISP, ASN and location estimates for an IP address. Each lookup asks all four and cross-checks them.</li>
          <li><strong>Cloudflare DNS-over-HTTPS</strong> (cloudflare-dns.com) — resolves domains and DNS records you look up.</li>
          <li><strong>Cloudflare speed test</strong> (speed.cloudflare.com) — endpoints used by the speed test, which transfers test data.</li>
          <li><strong>Cloudflare STUN</strong> (stun.cloudflare.com) — used by the WebRTC test to learn your public address.</li>
          <li><strong>bash.ws</strong> — DNS resolver detection; called through our server and, for the unique test hostnames, by your browser.</li>
          <li><strong>Your device location</strong> — only if you click "Compare with my device location". Your browser asks permission; the position is drawn on the map in your browser and is never sent or stored.</li>
          <li><strong>OpenStreetMap</strong> — map tiles on the Lookup page, and the map link on My IP.</li>
        </ul>

        <h2>Accuracy and limits</h2>
        <p>
          IP geolocation is an estimate and can be wrong at city level, so lookups show how many sources agree and the area the location likely falls in. Anycast addresses (such as 1.1.1.1) have no single location and are shown without one. Details shown as "Unavailable"
          were not provided by the service and are never guessed. Speed test results are estimates.
          Privacy checks give indications only; they cannot guarantee anonymity or prove a VPN is
          secure. The website checker reports reachability from our server at one moment, which can
          differ from what you experience.
        </p>
      </div>
    </>
  );
}
