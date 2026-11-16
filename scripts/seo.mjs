// Post-build: writes sitemap.xml and adds a Sitemap line to robots.txt in dist/.
// Needs the production origin: set SITE_URL (e.g. https://iptools.example.com). On Vercel,
// VERCEL_PROJECT_PRODUCTION_URL is used automatically if SITE_URL is not set.
import { appendFileSync, writeFileSync } from 'node:fs';

const raw = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
if (!raw) {
  console.warn('seo: SITE_URL not set; skipping sitemap.xml (set it for production builds).');
  process.exit(0);
}
const origin = (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/+$/, '');

const paths = [
  '/', '/lookup', '/tools', '/tools/dns-lookup', '/tools/speed-test',
  '/tools/website-checker', '/tools/privacy-check', '/tools/browser-info', '/about',
];
const xml =
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  paths.map((p) => `  <url><loc>${origin}${p === '/' ? '/' : p}</loc></url>`).join('\n') +
  '\n</urlset>\n';
writeFileSync('dist/sitemap.xml', xml);
appendFileSync('dist/robots.txt', `Sitemap: ${origin}/sitemap.xml\n`);
console.log(`seo: wrote dist/sitemap.xml for ${origin}`);
