export interface GeoEstimate {
  source: string;
  latitude: number;
  longitude: number;
  city: string | null;
  region: string | null;
  country: string | null;
  postalCode: string | null;
  /** Radius the provider itself claims, in km (only some providers report this). */
  accuracyKm: number | null;
}

export type Confidence = 'high' | 'medium' | 'low';

export interface Consensus {
  latitude: number;
  longitude: number;
  /** Radius (km) of the area the true location is likely in, based on source disagreement. */
  radiusKm: number;
  confidence: Confidence;
  note: string;
  /** Estimates that agree with each other; the rest are outliers. */
  cluster: GeoEstimate[];
  outliers: GeoEstimate[];
  /** The cluster member closest to the centre; its place names are used for display. */
  nearest: GeoEstimate;
}

const EARTH_KM = 6371;
const CLUSTER_KM = 75; // sources within this distance of each other are treated as agreeing
const MIN_RADIUS_KM = 5; // IP geolocation is never meaningfully better than this

const rad = (d: number) => (d * Math.PI) / 180;

type Point = { latitude: number; longitude: number };

export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Mean of points on the sphere (safe across the antimeridian and near the poles). */
export function centroid(points: Point[]): Point {
  let x = 0, y = 0, z = 0;
  for (const p of points) {
    const la = rad(p.latitude), lo = rad(p.longitude);
    x += Math.cos(la) * Math.cos(lo);
    y += Math.cos(la) * Math.sin(lo);
    z += Math.sin(la);
  }
  const n = points.length;
  x /= n; y /= n; z /= n;
  return {
    latitude: (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI,
    longitude: (Math.atan2(y, x) * 180) / Math.PI,
  };
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Combines location estimates from several providers.
 * Estimates that agree are averaged; far-off outliers are ignored (but still reported).
 * The returned radius reflects how much the sources actually disagree, rather than a fixed guess.
 */
export function buildConsensus(estimates: GeoEstimate[]): Consensus | null {
  const n = estimates.length;
  if (n === 0) return null;

  if (n === 1) {
    const e = estimates[0];
    return {
      latitude: e.latitude,
      longitude: e.longitude,
      radiusKm: Math.max(e.accuracyKm ?? 25, MIN_RADIUS_KM),
      confidence: 'low',
      note: `Only one source (${e.source}) returned a location, so it could not be cross-checked.`,
      cluster: [e],
      outliers: [],
      nearest: e,
    };
  }

  // Medoid: the estimate with the smallest total distance to all others.
  const medoid = estimates.reduce((best, e) => {
    const total = (x: GeoEstimate) => estimates.reduce((s, o) => s + distanceKm(x, o), 0);
    return total(e) < total(best) ? e : best;
  });
  const cluster = estimates.filter((e) => distanceKm(e, medoid) <= CLUSTER_KM);
  const outliers = estimates.filter((e) => !cluster.includes(e));

  const center = centroid(cluster);
  const spread = Math.max(...cluster.map((e) => distanceKm(e, center)));
  const claimed = median(cluster.map((e) => e.accuracyKm).filter((v): v is number => v !== null));
  const radiusKm = Math.max(spread, claimed ?? 0, MIN_RADIUS_KM);

  const nearest = cluster.reduce((best, e) => (distanceKm(e, center) < distanceKm(best, center) ? e : best));

  let confidence: Confidence = 'low';
  if (cluster.length >= 3 && radiusKm <= 50) confidence = 'high';
  else if (cluster.length >= 2 && radiusKm <= 100) confidence = 'medium';

  const parts = [`${cluster.length} of ${n} sources agree within about ${Math.ceil(radiusKm)} km`];
  if (outliers.length) {
    parts.push(
      `${outliers.length === 1 ? 'one source' : `${outliers.length} sources`} (${outliers.map((o) => o.source).join(', ')}) placed it far away and ${outliers.length === 1 ? 'was' : 'were'} ignored`,
    );
  }

  return {
    latitude: center.latitude,
    longitude: center.longitude,
    radiusKm,
    confidence,
    note: parts.join('; ') + '.',
    cluster,
    outliers,
    nearest,
  };
}
