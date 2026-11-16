import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Skeleton } from './components/ui';
import HomePage from './pages/HomePage';
import { NotFoundPage, ToolsPage } from './pages/StubPages';

// Secondary pages are code-split to keep the first load small.
const LookupPage = lazy(() => import('./pages/LookupPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const DnsLookupPage = lazy(() => import('./pages/DnsLookupPage'));
const SpeedTestPage = lazy(() => import('./pages/SpeedTestPage'));
const WebsiteCheckerPage = lazy(() => import('./pages/WebsiteCheckerPage'));
const PrivacyCheckPage = lazy(() => import('./pages/PrivacyCheckPage'));
const BrowserInfoPage = lazy(() => import('./pages/BrowserInfoPage'));

export default function App() {
  return (
    <Suspense fallback={<Skeleton />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="lookup" element={<LookupPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="tools/dns-lookup" element={<DnsLookupPage />} />
          <Route path="tools/speed-test" element={<SpeedTestPage />} />
          <Route path="tools/website-checker" element={<WebsiteCheckerPage />} />
          <Route path="tools/privacy-check" element={<PrivacyCheckPage />} />
          <Route path="tools/browser-info" element={<BrowserInfoPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
