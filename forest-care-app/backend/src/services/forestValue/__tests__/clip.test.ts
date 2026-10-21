import { describe, expect, it } from 'vitest';
import { clipStandsToParcel, planarAreaHa, planarAreaM2 } from '../clip';
import { rect, stand } from './fixtures';

describe('planarAreaM2', () => {
  it('computes rectangle area in square metres', () => {
    expect(planarAreaM2(rect(395000, 6876000, 100, 50))).toBeCloseTo(5000);
  });

  it('subtracts holes', () => {
    const outer = rect(0, 0, 100, 100).coordinates as number[][][];
    const hole = rect(10, 10, 10, 10).coordinates as number[][][];
    expect(planarAreaM2({ type: 'Polygon', coordinates: [outer[0], hole[0]] })).toBeCloseTo(9900);
  });

  it('sums multipolygon parts', () => {
    const a = rect(0, 0, 100, 100).coordinates as number[][][];
    const b = rect(500, 0, 100, 100).coordinates as number[][][];
    expect(planarAreaHa({ type: 'MultiPolygon', coordinates: [a, b] })).toBeCloseTo(2);
  });
});

describe('clipStandsToParcel', () => {
  const parcel = rect(395000, 6876000, 200, 100); // 2 ha

  it('keeps only the part of a stand inside the parcel', () => {
    const half = stand({ id: 'half', geometry: rect(395100, 6876000, 300, 100) });
    const [result] = clipStandsToParcel(parcel, [half]);
    expect(result.stand.id).toBe('half');
    expect(result.areaHaInParcel).toBeCloseTo(1);
  });

  it('drops stands outside the parcel', () => {
    const outside = stand({ id: 'out', geometry: rect(396000, 6876000, 100, 100) });
    expect(clipStandsToParcel(parcel, [outside])).toHaveLength(0);
  });

  it('drops boundary slivers below the minimum area', () => {
    // 2 m × 100 m = 0.02 ha stand, of which 1 m inside = 0.01 ha … just under 0.01 ha with 0.9 m
    const sliver = stand({ id: 'sliver', geometry: rect(395199.1, 6876000, 2, 100) });
    expect(clipStandsToParcel(parcel, [sliver])).toHaveLength(0);
  });

  it('handles several stands that together cover the parcel', () => {
    const stands = [
      stand({ id: 'a', geometry: rect(394990, 6875990, 110, 120) }),
      stand({ id: 'b', geometry: rect(395100, 6875990, 110, 120) }),
    ];
    const result = clipStandsToParcel(parcel, stands);
    const total = result.reduce((sum, r) => sum + r.areaHaInParcel, 0);
    expect(total).toBeCloseTo(2);
  });
});
