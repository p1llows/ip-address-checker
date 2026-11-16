import { describe, expect, it } from 'vitest';
import { buildConsensus, centroid, distanceKm, type GeoEstimate } from './geo';

const est = (source: string, latitude: number, longitude: number, accuracyKm: number | null = null): GeoEstimate => ({
  source, latitude, longitude, city: null, region: null, country: null, postalCode: null, accuracyKm,
});

describe('distanceKm', () => {
  it('matches known distances', () => {
    // London -> Paris is about 344 km
    expect(distanceKm({ latitude: 51.5074, longitude: -0.1278 }, { latitude: 48.8566, longitude: 2.3522 })).toBeCloseTo(344, -1);
    expect(distanceKm({ latitude: 10, longitude: 10 }, { latitude: 10, longitude: 10 })).toBe(0);
  });
});

describe('centroid', () => {
  it('averages across the antimeridian correctly', () => {
    const c = centroid([{ latitude: 0, longitude: 179 }, { latitude: 0, longitude: -179 }]);
    expect(Math.abs(c.longitude)).toBeCloseTo(180, 3);
  });
});

describe('buildConsensus', () => {
  it('returns null with no estimates', () => {
    expect(buildConsensus([])).toBeNull();
  });
  it('marks a single source as low confidence', () => {
    const c = buildConsensus([est('A', 14.6, 120.98, 10)])!;
    expect(c.confidence).toBe('low');
    expect(c.radiusKm).toBe(10);
    expect(c.note).toMatch(/Only one source/);
  });
  it('is high confidence when several sources agree, with a radius from their real spread', () => {
    // Manila-area estimates from different providers (~10-15 km apart)
    const c = buildConsensus([
      est('geojs', 14.5971, 120.9798, 10),
      est('ipwho', 14.6042, 120.9822),
      est('ipapi', 14.5764, 121.0851),
      est('ipinfo', 14.6488, 121.0509),
    ])!;
    expect(c.confidence).toBe('high');
    expect(c.cluster).toHaveLength(4);
    expect(c.radiusKm).toBeGreaterThan(5);
    expect(c.radiusKm).toBeLessThan(25);
  });
  it('ignores a far-off outlier and says so', () => {
    const c = buildConsensus([
      est('A', 37.4, -122.08),
      est('B', 37.39, -122.07),
      est('C', 37.75, -97.82), // 1,500+ km away
    ])!;
    expect(c.outliers.map((o) => o.source)).toEqual(['C']);
    expect(c.latitude).toBeCloseTo(37.395, 1);
    expect(c.note).toMatch(/ignored/);
    expect(c.confidence).toBe('medium');
  });
  it('is low confidence when every source disagrees', () => {
    const c = buildConsensus([est('A', 51.5, -0.12), est('B', 40.7, -74), est('C', -33.9, 151.2)])!;
    expect(c.confidence).toBe('low');
  });
  it('never reports a radius smaller than the floor', () => {
    const c = buildConsensus([est('A', 10, 10), est('B', 10, 10)])!;
    expect(c.radiusKm).toBe(5);
  });
});
