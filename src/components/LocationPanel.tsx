import { lazy, Suspense, useState } from 'react';
import { distanceKm } from '../lib/geo';
import type { IpInfo } from '../services/ipInfoService';
import { fetchPublicIp, IPV4_URL, IPV6_URL } from '../services/ipService';
import { Icon } from './Icon';
import type { DeviceLocation } from './LocationMap';
import { ErrorMessage, Skeleton } from './ui';

const LocationMap = lazy(() => import('./LocationMap'));

const CONFIDENCE = {
  high: { icon: '✓', text: 'High confidence' },
  medium: { icon: '~', text: 'Medium confidence' },
  low: { icon: '?', text: 'Low confidence' },
} as const;

const fmtKm = (km: number) => (km < 10 ? km.toFixed(1) : String(Math.round(km)));

interface DeviceState {
  loc: DeviceLocation;
  /** true/false once we know whether the looked-up IP is this device's own public IP. */
  isOwnIp: boolean;
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
    });
  });
}

function geoErrorText(e: unknown): string {
  const code = (e as { code?: number } | null)?.code;
  if (code === 1) return 'Location permission was denied. Allow it in your browser if you want to compare.';
  if (code === 3) return 'Your device took too long to determine its location. Please try again.';
  if (e instanceof Error && e.message === 'unsupported') return 'This browser does not support device location.';
  return 'Your device could not determine its location.';
}

export function LocationPanel({ info }: { info: IpInfo }) {
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPoint = info.latitude !== null && info.longitude !== null && info.accuracyKm !== null;
  const place = [info.city, info.country].filter(Boolean).join(', ') || 'Estimated location';

  const compare = async () => {
    setBusy(true);
    setError(null);
    try {
      // The position stays in this browser: it is only drawn on the map, never sent anywhere.
      const [pos, v4, v6] = await Promise.all([
        getPosition(),
        fetchPublicIp(fetch, IPV4_URL).catch(() => null),
        fetchPublicIp(fetch, IPV6_URL).catch(() => null),
      ]);
      setDevice({
        loc: { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy },
        isOwnIp: info.ip === v4 || info.ip === v6,
      });
    } catch (e) {
      setError(geoErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const point = hasPoint ? { latitude: info.latitude!, longitude: info.longitude! } : null;
  const deviceDistance = device && point ? distanceKm(device.loc, point) : null;
  const c = info.confidence ? CONFIDENCE[info.confidence] : null;

  return (
    <section className="info-card map-card" aria-label="Location and map">
      <h2>Location estimate</h2>

      {c && (
        <p className={`result-status conf-${info.confidence}`}>
          <span className="status-icon" aria-hidden="true">{c.icon}</span>
          <strong>{c.text}</strong>
          {info.accuracyKm !== null && <span className="meta">· likely within about {Math.ceil(info.accuracyKm)} km</span>}
        </p>
      )}
      {info.confidenceNote && <p className="note">{info.confidenceNote}</p>}

      {hasPoint ? (
        <>
          <Suspense fallback={<Skeleton />}>
            <LocationMap
              lat={info.latitude!}
              lon={info.longitude!}
              radiusKm={info.accuracyKm!}
              estimates={info.estimates}
              agreeing={info.agreeing}
              label={place}
              device={device?.loc ?? null}
            />
          </Suspense>
          <ul className="map-legend">
            <li><span className="dot dot-solid" aria-hidden="true" /> Combined estimate</li>
            <li><span className="dot dot-hollow" aria-hidden="true" /> A source's own estimate</li>
            <li><span className="dot dot-ignored" aria-hidden="true" /> Source ignored (far from the others)</li>
            <li><span className="dot dot-area" aria-hidden="true" /> Area the location likely falls in</li>
            {device && <li><span className="dot dot-device" aria-hidden="true" /> Your device</li>}
          </ul>

          {info.estimates.length > 0 && (
            <details className="sources">
              <summary>Compare the {info.estimates.length} sources</summary>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Source</th>
                      <th scope="col">Place</th>
                      <th scope="col">Coordinates</th>
                      <th scope="col">From combined</th>
                      <th scope="col">Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.estimates.map((e) => (
                      <tr key={e.source}>
                        <th scope="row">{e.source}</th>
                        <td>{[e.city, e.region].filter(Boolean).join(', ') || 'Unavailable'}</td>
                        <td className="mono">{e.latitude.toFixed(3)}, {e.longitude.toFixed(3)}</td>
                        <td>{fmtKm(distanceKm(e, point!))} km</td>
                        <td>{info.agreeing.includes(e.source) ? '✓ Yes' : '✕ Ignored'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <div className="device-compare">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void compare()} disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="eye" />}
              {busy ? 'Locating…' : device ? 'Update my device location' : 'Compare with my device location'}
            </button>
            <p className="note">
              Optional. Your browser asks for permission and uses GPS or Wi-Fi, which is far more
              precise than any IP address. The position is only drawn on this map and is never sent
              or stored.
            </p>
            {error && <ErrorMessage message={error} />}
            {device && deviceDistance !== null && (
              <p role="status">
                Your device is <strong>{fmtKm(deviceDistance)} km</strong> from the combined IP estimate
                {device.isOwnIp
                  ? '. Since this is your own IP address, that distance is how far off IP-based location was for you.'
                  : '. This is not your own IP address, so the distance says nothing about its accuracy.'}
              </p>
            )}
          </div>
        </>
      ) : info.anycast ? null : (
        <p className="unavailable">
          None of the sources could place this address, so no map is shown. Network details above may
          still be available.
        </p>
      )}
    </section>
  );
}
