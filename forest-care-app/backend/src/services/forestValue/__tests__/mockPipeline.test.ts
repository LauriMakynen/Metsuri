import { describe, expect, it } from 'vitest';
import { clipStandsToParcel, planarAreaHa } from '../clip';
import { generateMockStands } from '../mockStands';
import { recommendOperations } from '../recommendations';
import { computeForestValue } from '../valuation';
import { PRICES, rect } from './fixtures';

describe('mock data through the whole pipeline', () => {
  const parcel = rect(395000, 6876000, 600, 400); // 24 ha

  it('generates stands that cover the parcel after clipping', () => {
    const stands = generateMockStands(parcel, 1);
    expect(stands.length).toBe(6);
    const clipped = clipStandsToParcel(parcel, stands);
    const covered = clipped.reduce((sum, c) => sum + c.areaHaInParcel, 0);
    expect(covered).toBeCloseTo(planarAreaHa(parcel));
    // The grid extends past the parcel, so stands are larger than their clipped parts
    expect(stands[0].areaHa).toBeGreaterThan(clipped[0].areaHaInParcel);
  });

  it('is deterministic for the same seed', () => {
    expect(generateMockStands(parcel, 3)).toEqual(generateMockStands(parcel, 3));
  });

  it('produces a plausible valuation and operations', () => {
    const clipped = clipStandsToParcel(parcel, generateMockStands(parcel, 0));
    const operations = recommendOperations(clipped, PRICES, 2026);
    const result = computeForestValue({
      propertyId: 1,
      parcelAreaHa: planarAreaHa(parcel),
      stands: clipped,
      prices: PRICES,
      provider: 'mock',
      operations,
      currentYear: 2026,
    });
    // Typical southern Finland stumpage values are a few thousand €/ha
    const perHa = result.value.midEur / result.areaHa;
    expect(perHa).toBeGreaterThan(1_000);
    expect(perHa).toBeLessThan(15_000);
    expect(result.value.lowEur).toBeLessThan(result.value.midEur);
    expect(result.value.highEur).toBeGreaterThan(result.value.midEur);
    // One template has 2019 data
    expect(result.warnings.map((w) => w.code)).toContain('outdated_data');
    expect(new Set(operations.map((o) => o.type))).toEqual(
      new Set(['clear_cut', 'soil_preparation', 'planting', 'thinning', 'first_thinning', 'young_stand_management'])
    );
    expect(operations.some((o) => o.source === 'metsakeskus')).toBe(true);
  });
});
