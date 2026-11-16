export interface InfoItem {
  label: string;
  value: string;
}

function detectBrowser(ua: string): string {
  const rules: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Microsoft Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome / Chromium-based'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of rules) {
    const m = ua.match(re);
    if (m) return `${name} ${m[1]}`;
  }
  return 'Unavailable';
}

const yn = (b: boolean) => (b ? 'Supported' : 'Not supported');

function storageWorks(): boolean {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return true;
  } catch {
    return false;
  }
}

/** Collected entirely in the browser; nothing is sent or stored. */
export function getBrowserInfo(): InfoItem[] {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  const dpr = window.devicePixelRatio || 1;
  return [
    { label: 'Browser', value: detectBrowser(navigator.userAgent) },
    { label: 'Operating system / platform', value: nav.userAgentData?.platform || nav.platform || 'Unavailable' },
    { label: 'User agent', value: navigator.userAgent },
    { label: 'Screen resolution', value: `${screen.width} × ${screen.height} px (pixel ratio ${dpr})` },
    { label: 'Viewport size', value: `${window.innerWidth} × ${window.innerHeight} px` },
    { label: 'Language', value: navigator.language || 'Unavailable' },
    { label: 'Preferred languages', value: navigator.languages?.join(', ') || 'Unavailable' },
    { label: 'Timezone', value: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unavailable' },
    { label: 'Color scheme preference', value: mq('(prefers-color-scheme: dark)') ? 'Dark' : mq('(prefers-color-scheme: light)') ? 'Light' : 'No preference' },
    { label: 'Reduced motion', value: mq('(prefers-reduced-motion: reduce)') ? 'Requested' : 'Not requested' },
    { label: 'Browser online status', value: navigator.onLine ? 'Online' : 'Offline' },
    { label: 'Cookies enabled', value: navigator.cookieEnabled ? 'Yes' : 'No' },
    { label: 'WebRTC', value: yn(typeof RTCPeerConnection !== 'undefined') },
    { label: 'Clipboard API', value: yn(!!navigator.clipboard) },
    { label: 'Service workers', value: yn('serviceWorker' in navigator) },
    { label: 'WebAssembly', value: yn(typeof WebAssembly !== 'undefined') },
    { label: 'Local storage', value: yn(storageWorks()) },
    { label: 'Geolocation API', value: yn('geolocation' in navigator) },
  ];
}
