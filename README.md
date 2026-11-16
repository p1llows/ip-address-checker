# IP Tools

A lightweight networking toolkit built with React, Vite and TypeScript, plus two small Vercel serverless functions. No database, no accounts, no analytics.

| Route | Tool |
|---|---|
| `/` | My IP: public IPv4/IPv6, ISP, ASN, approximate location |
| `/lookup` | IP and domain lookup with map and local history |
| `/tools` | Index of tools |
| `/tools/dns-lookup` | A, AAAA, MX, TXT, NS, CNAME, SOA records |
| `/tools/speed-test` | Download, upload, ping, jitter |
| `/tools/website-checker` | Reachability, HTTP status, response time (server-side, SSRF-protected) |
| `/tools/privacy-check` | WebRTC test, DNS resolver check, VPN before/after comparison |
| `/tools/browser-info` | Browser, screen, language, timezone, capabilities |
| `/about` | Privacy and the external services used |

## Requirements

- Node.js 18 or later

## Develop, test, build

```bash
npm install
npm run dev      # http://localhost:5173 (also serves /api/* from the api/ folder)
npm test         # unit tests (validation, services, SSRF protection)
npm run build    # type-check, build, then generate sitemap.xml
npm run preview  # static preview only; /api/* is not served by this command
```

Set `SITE_URL` (for example `https://iptools.example.com`) when building for production so `sitemap.xml` and the robots.txt `Sitemap:` line are generated. On Vercel, `VERCEL_PROJECT_PRODUCTION_URL` is used automatically if `SITE_URL` is unset.

## Architecture

```text
api/                         Vercel serverless functions (plain Node handlers)
├── check.js                 GET /api/check?url=...   website availability
├── dns-leak.js              GET /api/dns-leak?action=id|result   proxy for bash.ws (no CORS)
├── _check.js, _ssrf.js      checker logic and SSRF guard (files starting with _ are not deployed as routes)
├── _http.js                 JSON helper, best-effort rate limit
└── _ssrf.test.js
src/
├── services/                all third-party and API calls (UI components never call them directly)
│   ├── ipService.ts         public IP detection (ipify)
│   ├── ipInfoService.ts     IP metadata (ipwho.is)
│   ├── dnsService.ts        DNS-over-HTTPS (Cloudflare)
│   ├── speedTestService.ts  speed test (Cloudflare)
│   ├── websiteCheckService.ts   client for /api/check
│   └── privacyService.ts    WebRTC analysis, DNS resolver test, VPN snapshot comparison
├── lib/                     validation, private/reserved IP detection, local history, browser info
├── hooks/useConnection.ts   homepage data
├── components/              Layout, shared UI, copy button, lazy-loaded Leaflet map
└── pages/                   one file per route (code-split)
```

## External services

| Purpose | Provider | Called from |
|---|---|---|
| Public IP | ipify | browser |
| IP metadata and location | ipwho.is, ipinfo.io, geojs.io, ipapi.co (all free tiers; check their terms before heavy or commercial use). Results are cross-checked: agreeing sources are averaged, outliers ignored, and the map radius comes from their disagreement. Anycast addresses get no pin. | browser |
| Device location (optional) | Browser Geolocation API, only on click; never sent or stored | browser |
| DNS records | Cloudflare DNS-over-HTTPS | browser |
| Speed test | speed.cloudflare.com | browser |
| WebRTC | stun.cloudflare.com | browser |
| DNS resolver detection | bash.ws | server proxy + browser |
| Map tiles | OpenStreetMap (follow its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)) | browser |

No API keys are used. If you switch to a keyed provider, put the key in a server-side environment variable and call it from a function in `api/`, never from `src/`.

## Security notes

- **SSRF (website checker):** only `http`/`https` on ports 80, 443, 8080, 8443; no credentials in URLs; literal and DNS-resolved addresses are checked against private, loopback, link-local (including cloud metadata), CGNAT, multicast, documentation, NAT64 and 6to4 ranges (IPv4, IPv6 and IPv4-mapped IPv6); the connection is made to the same addresses that were validated (no DNS-rebinding gap); every redirect hop is revalidated, max 5 redirects; 8 second total timeout; the response body is never downloaded.
- **Rate limiting:** `api/_http.js` keeps an in-memory counter per client IP. Serverless instances do not share memory, so this only slows abuse. For a hard limit, enable Vercel Firewall rate limiting or a shared store such as Upstash.
- **Headers:** `vercel.json` sets a Content Security Policy (all permitted hosts are listed in `connect-src`; update it if you add a service), `nosniff`, a referrer policy, a permissions policy and HSTS. The CSP was verified against the production build with every tool exercised.
- Error responses never include stack traces or internals.

## Deployment (Vercel)

1. Import the repository at <https://vercel.com/new>. Vercel detects Vite (build `npm run build`, output `dist`) and deploys `api/` as functions.
2. Add the `SITE_URL` environment variable.
3. `vercel.json` rewrites every non-`/api` path to `index.html` for client-side routing.

Static-only hosts (Cloudflare Pages without functions) will serve everything except the website checker and the DNS resolver check, which need `/api`.

### Verify after deploying

- `/` shows your IP and details; compare with another source.
- `/tools/website-checker`: `example.com` is Available; `http://127.0.0.1` and `http://169.254.169.254` are rejected.
- `/tools/privacy-check`: WebRTC and DNS tests complete.
- Open DevTools and confirm there are no Content Security Policy violations.

## Known limitations

- IP geolocation is approximate by nature, even with four sources cross-checked. Only the optional device location is precise, and only for your own position.
- Free tiers are rate limited (for example ipwho.is and ipapi.co). Lookups still work if some sources fail, and results are cached for 5 minutes.
- The DNS resolver check relies on bash.ws. If it is down the test reports "Unable to verify".
- Speed test results vary with device and browser and use Cloudflare's closest edge location.
- Pages set their own titles, descriptions, canonical and Open Graph tags in the browser. Crawlers that don't run JavaScript only see the homepage metadata in `index.html`; add prerendering if that matters for SEO.
- No social preview image is included yet (`og:image`).
- Analytics are intentionally not included. If you add them, send only event names (for example `speed_test_completed`), never IP addresses or lookup values.

## Notes

- `package.json` has an `overrides` entry that replaces Rollup's native binary with its WebAssembly build (`@rollup/wasm-node`), added because Windows App Control blocked the native `.node` file on the development machine. Remove it where the native binary loads; the app works either way.
- Ad blockers or restrictive networks may block ipify, ipwho.is or Cloudflare endpoints; the affected tool shows an error with a Retry button.
