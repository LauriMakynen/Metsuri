import { describe, expect, it } from 'vitest';
import {
  BASE_UNCERTAINTY,
  MAX_UNCERTAINTY,
  WASTE_SHARE,
  computeForestValue,
  computeUncertainty,
  estimateHarvest,
  priceCutTypeFor,
  roundEur,
  stratumAssortments,
  valueRange,
  valueStand,
} from '../valuation';
import { PRICES, clipped, stand, stratum } from './fixtures';

describe('priceCutTypeFor', () => {
  it('maps development classes to the harvest type of the price', () => {
    expect(priceCutTypeFor({ developmentClass: '04', meanAgeYears: 90 })).toBe('regeneration');
    expect(priceCutTypeFor({ developmentClass: '03', meanAgeYears: 50 })).toBe('thinning');
    expect(priceCutTypeFor({ developmentClass: '02', meanAgeYears: 30 })).toBe('first_thinning');
    expect(priceCutTypeFor({ developmentClass: 'ER', meanAgeYears: null })).toBe('thinning');
  });

  it('guesses from age when the class is unknown', () => {
    expect(priceCutTypeFor({ developmentClass: null, meanAgeYears: 85 })).toBe('regeneration');
    expect(priceCutTypeFor({ developmentClass: null, meanAgeYears: 20 })).toBe('first_thinning');
    expect(priceCutTypeFor({ developmentClass: null, meanAgeYears: null })).toBe('thinning');
  });
});

describe('stratumAssortments', () => {
  it('uses the sawlog/pulpwood split from the source', () => {
    const a = stratumAssortments(stratum({ sawlogM3PerHa: 120, pulpwoodM3PerHa: 60 }), '04');
    expect(a).toEqual({ species: 'spruce', sawlogM3PerHa: 120, pulpwoodM3PerHa: 60 });
  });

  it('estimates the split when the source has none', () => {
    const a = stratumAssortments(stratum({ volumeM3PerHa: 200, sawlogM3PerHa: null, pulpwoodM3PerHa: null }), '04');
    expect(a.sawlogM3PerHa).toBeCloseTo(200 * 0.62);
    expect(a.pulpwoodM3PerHa).toBeCloseTo(200 * (1 - WASTE_SHARE) - 200 * 0.62);
  });

  it('gives no merchantable volume for seedling stands', () => {
    const a = stratumAssortments(stratum({ volumeM3PerHa: 20 }), 'T2');
    expect(a.sawlogM3PerHa + a.pulpwoodM3PerHa).toBe(0);
  });

  it('sells other deciduous logs as pulpwood', () => {
    const a = stratumAssortments(
      stratum({ species: 'other_deciduous', sawlogM3PerHa: 10, pulpwoodM3PerHa: 30 }),
      '03'
    );
    expect(a.sawlogM3PerHa).toBe(0);
    expect(a.pulpwoodM3PerHa).toBe(40);
  });
});

describe('valueStand', () => {
  it('multiplies volumes by area and stumpage prices', () => {
    // 2 ha × (100 m³ spruce log × 78 € + 50 m³ spruce pulp × 28 €) = 2 × 9 200 €
    const { valuation, byAssortment, bySpecies } = valueStand(clipped(stand(), 2), PRICES);
    expect(valuation.valueEur).toBeCloseTo(18_400);
    expect(valuation.volumeM3).toBeCloseTo(300);
    expect(valuation.volumeM3PerHa).toBeCloseTo(150);
    expect(valuation.sawlogShare).toBeCloseTo(100 / 150);
    expect(byAssortment.spruce_log).toBeCloseTo(15_600);
    expect(byAssortment.spruce_pulp).toBeCloseTo(2_800);
    expect(bySpecies.spruce).toBeCloseTo(18_400);
  });

  it('uses thinning prices for a maturing stand', () => {
    const { valuation } = valueStand(clipped(stand({ developmentClass: '03' })), PRICES);
    expect(valuation.priceCutType).toBe('thinning');
    expect(valuation.valueEur).toBeCloseTo(100 * 63 + 50 * 22);
  });

  it('gives no value for non-forest land', () => {
    const { valuation } = valueStand(clipped(stand({ isForestLand: false })), PRICES);
    expect(valuation.valueEur).toBe(0);
  });

  it('computes species shares of volume', () => {
    const mixed = stand({
      strata: [stratum({ species: 'pine', volumeM3PerHa: 75 }), stratum({ species: 'birch', volumeM3PerHa: 25 })],
      mainSpecies: null,
    });
    const { valuation } = valueStand(clipped(mixed), PRICES);
    expect(valuation.speciesShares.pine).toBeCloseTo(0.75);
    expect(valuation.speciesShares.birch).toBeCloseTo(0.25);
    expect(valuation.mainSpecies).toBe('pine');
  });
});

describe('estimateHarvest', () => {
  it('values a clear cut with regeneration prices', () => {
    const { removalM3, incomeEur } = estimateHarvest(stand(), 1, 1, 'regeneration', PRICES);
    expect(removalM3).toBeCloseTo(150);
    expect(incomeEur).toBeCloseTo(9_200);
  });

  it('takes less sawlog in a thinning', () => {
    const { removalM3, incomeEur } = estimateHarvest(stand({ developmentClass: '03' }), 1, 0.3, 'thinning', PRICES);
    // 30 % of 150 m³; sawlog 100 × 0.7 × 0.3 = 21 m³, pulp (150 − 70) × 0.3 = 24 m³
    expect(removalM3).toBeCloseTo(45);
    expect(incomeEur).toBeCloseTo(21 * 63 + 24 * 22);
  });
});

describe('uncertainty and range', () => {
  it('starts from the base uncertainty', () => {
    expect(computeUncertainty({ provider: 'metsakeskus', dataAgeYears: 2, priceSource: 'luke' })).toBe(BASE_UNCERTAINTY);
  });

  it('grows with outdated data and fallback prices', () => {
    const u = computeUncertainty({ provider: 'metsakeskus', dataAgeYears: 8, priceSource: 'fallback' });
    expect(u).toBeCloseTo(0.15 + 0.03 + 0.05);
  });

  it('is wide for manual input and capped', () => {
    expect(computeUncertainty({ provider: 'manual', dataAgeYears: null, priceSource: 'luke' })).toBe(0.3);
    expect(computeUncertainty({ provider: 'manual', dataAgeYears: 40, priceSource: 'fallback' })).toBe(MAX_UNCERTAINTY);
  });

  it('rounds the range to sensible steps', () => {
    expect(roundEur(20_349)).toBe(20_500);
    expect(roundEur(1_234)).toBe(1_200);
    expect(roundEur(87)).toBe(90);
    expect(valueRange(20_000, 0.15)).toEqual({ lowEur: 17_000, midEur: 20_000, highEur: 23_000, uncertainty: 0.15 });
  });
});

describe('computeForestValue', () => {
  const base = {
    propertyId: 7,
    prices: PRICES,
    provider: 'metsakeskus' as const,
    operations: [],
    currentYear: 2026,
    now: new Date('2026-10-16T12:00:00Z'),
  };

  it('sums stands and weights mean age by area', () => {
    const result = computeForestValue({
      ...base,
      parcelAreaHa: 3,
      stands: [
        clipped(stand({ id: 'a', meanAgeYears: 80 }), 2),
        clipped(stand({ id: 'b', meanAgeYears: 20, developmentClass: 'T2', strata: [stratum({ volumeM3PerHa: 10 })] }), 1),
      ],
    });
    expect(result.value.midEur).toBe(roundEur(18_400));
    expect(result.totalVolumeM3).toBeCloseTo(310);
    expect(result.volumeM3PerHa).toBeCloseTo(310 / 3);
    expect(result.meanAgeYears).toBe(60);
    expect(result.coveredAreaHa).toBeCloseTo(3);
    expect(result.warnings).toEqual([]);
    expect(result.prices).not.toHaveProperty('prices');
  });

  it('warns about old inventory data', () => {
    const result = computeForestValue({ ...base, parcelAreaHa: 1, stands: [clipped(stand({ inventoryYear: 2019 }))] });
    expect(result.data.isOutdated).toBe(true);
    expect(result.data.inventoryYearMin).toBe(2019);
    expect(result.warnings.map((w) => w.code)).toContain('outdated_data');
    expect(result.value.uncertainty).toBeCloseTo(0.17);
  });

  it('does not count exactly five-year-old data as outdated', () => {
    const result = computeForestValue({ ...base, parcelAreaHa: 1, stands: [clipped(stand({ inventoryYear: 2021 }))] });
    expect(result.data.isOutdated).toBe(false);
  });

  it('warns about small parcels, partial coverage and fallback prices', () => {
    const result = computeForestValue({
      ...base,
      prices: { ...PRICES, source: 'fallback' },
      parcelAreaHa: 0.4,
      stands: [clipped(stand(), 0.2)],
    });
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toEqual(expect.arrayContaining(['small_parcel', 'partial_coverage', 'fallback_prices']));
  });

  it('reports parcels that are not forest land', () => {
    const result = computeForestValue({
      ...base,
      parcelAreaHa: 1,
      stands: [clipped(stand({ isForestLand: false }))],
    });
    expect(result.value.midEur).toBe(0);
    expect(result.forestLandAreaHa).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain('no_forest_land');
  });
});
