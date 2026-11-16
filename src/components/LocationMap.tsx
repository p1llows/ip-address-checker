import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GeoEstimate } from '../lib/geo';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracyM: number;
}

const WHITE = '#f2f2f2';
const MUTED = '#e07a6f';
const BLUE = '#6cb2ff';

const place = (e: GeoEstimate) => [e.city, e.region, e.country].filter(Boolean).join(', ') || 'no place name';

/**
 * Interactive OpenStreetMap view of the combined IP location.
 * - The shaded circle is the area the location most likely falls in (from how much sources disagree).
 * - Hollow dots are each source's own estimate; red ones were far from the others and ignored.
 * - The blue dot (optional) is the device's own position from the browser.
 */
export default function LocationMap({
  lat,
  lon,
  radiusKm,
  estimates,
  agreeing,
  label,
  device,
}: {
  lat: number;
  lon: number;
  radiusKm: number;
  estimates: GeoEstimate[];
  agreeing: string[];
  label: string;
  device: DeviceLocation | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([lat, lon, radiusKm, estimates.map((e) => [e.source, e.latitude, e.longitude]), device]);

  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { scrollWheelZoom: false }).setView([lat, lon], 9);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const area = L.circle([lat, lon], { radius: radiusKm * 1000, weight: 1, color: WHITE, fillOpacity: 0.12 }).addTo(map);
    const bounds = area.getBounds();

    for (const e of estimates) {
      const ok = agreeing.includes(e.source);
      L.circleMarker([e.latitude, e.longitude], {
        radius: 5, weight: 2, color: ok ? WHITE : MUTED, fillColor: '#121212', fillOpacity: 1,
      })
        .bindTooltip(`${e.source}: ${place(e)}${ok ? '' : ' (ignored: far from other sources)'}`)
        .addTo(map);
      bounds.extend([e.latitude, e.longitude]);
    }

    L.circleMarker([lat, lon], { radius: 7, weight: 2, color: '#121212', fillColor: WHITE, fillOpacity: 1 })
      .bindTooltip(`Combined estimate: ${label} (within about ${Math.ceil(radiusKm)} km)`, { permanent: false })
      .addTo(map);

    if (device) {
      const acc = L.circle([device.latitude, device.longitude], {
        radius: device.accuracyM, weight: 1, color: BLUE, fillOpacity: 0.12,
      }).addTo(map);
      L.circleMarker([device.latitude, device.longitude], {
        radius: 7, weight: 2, color: '#121212', fillColor: BLUE, fillOpacity: 1,
      })
        .bindTooltip(`Your device (within about ${Math.round(device.accuracyM)} m)`)
        .addTo(map);
      bounds.extend(acc.getBounds());
    }

    map.fitBounds(bounds.pad(0.25), { maxZoom: 14 });
    return () => {
      map.remove();
    };
    // `key` captures every input that should rebuild the map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div
      ref={el}
      className="map"
      role="img"
      aria-label={`Map of the estimated location: ${label}, within about ${Math.ceil(radiusKm)} kilometres`}
    />
  );
}
