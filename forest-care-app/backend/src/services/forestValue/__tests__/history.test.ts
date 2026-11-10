import { describe, expect, it } from 'vitest';
import { computeValueHistory, priceRatioYearsAgo, volumeRatioYearsAgo } from '../history';
import { bundledPriceHistory, parsePriceHistory, type PriceHistory } from '../priceHistory';
import type { ForestValueResult, StandValuation, TimberAssortment } from '../types';

const ASSORTMENTS: TimberAssortment[] = ['pine_log', 'spruce_log', 'birch_log', 'pine_pulp', 'spruce_pulp', 'birch_pulp'];

/** Every assortment costs `now` in 2025 and `then` in each earlier year */
function flatPrices(now: number, then: number, firstYear = 1990): PriceHistory {
  const series = {} as PriceHistory['series'];
  for (const a of ASSORTMENTS) {
    series[a] = {};
    for (let year = firstYear; year < 2025; year++) series[a][year] = then;
    series[a][2025] = now;
  }
  return { source: 'bundled', latestYear: 2025, series };
}

function stand(overrides: Partial<StandValuation> = {}): StandValuation {
  return {
    standId: 's1',
    standNumber: '1',
    geometry: null,
    areaHaInParcel: 2,
    developmentClass: '03',
    mainSpecies: 'pine',
    speciesShares: { pine: 1, spruce: 0, birch: 0, other_deciduous: 0 },
    meanAgeYears: 60,
    volumeM3: 400,
    volumeM3PerHa: 200,
    sawlogShare: 0.5,
    pulpwoodShare: 0.45,
    valueEur: 20_000,
    priceCutType: 'thinning',
    isForestLand: true,
    inventoryYear: 2024,
    valueByAssortment: { pine_log: 15_000, spruce_log: 0, birch_log: 0, pine_pulp: 5_000, spruce_pulp: 0, birch_pulp: 0 },
    fertilityClass: 3,
    ...overrides,
  };
}

function result(stands: StandValuation[]): ForestValueResult {
  return {
    propertyId: 1,
    stands,
    data: { provider: 'metsakeskus', inventoryYearMin: 2024, inventoryYearMax: 2024, isOutdated: false },
  } as unknown as ForestValueResult;
}

describe('volumeRatioYearsAgo', () => {
  it('is 1 now and shrinks the further back we go', () => {
    expect(volumeRatioYearsAgo(60, 0, 'pine', 3)).toBe(1);
    const five = volumeRatioYearsAgo(60, 5, 'pine', 3);
    const ten = volumeRatioYearsAgo(60, 10, 'pine', 3);
    expect(five).toBeLessThan(1);
    expect(ten).toBeLessThan(five);
    expect(ten).toBeGreaterThan(0.5);
  });

  it('is 0 before the stand was established, never negative', () => {
    expect(volumeRatioYearsAgo(8, 10, 'spruce', 2)).toBe(0);
    expect(volumeRatioYearsAgo(10, 10, 'spruce', 2)).toBe(0);
  });

  it('grows relatively faster in a young stand than in an old one', () => {
    const young = 1 - volumeRatioYearsAgo(30, 5, 'pine', 3);
    const old = 1 - volumeRatioYearsAgo(90, 5, 'pine', 3);
    expect(young).toBeGreaterThan(old * 2);
  });

  it('uses plain compound growth when the age is unknown', () => {
    expect(volumeRatioYearsAgo(null, 10, 'pine', 3)).toBeCloseTo(Math.pow(1.03, -10), 6);
  });
});

describe('priceRatioYearsAgo', () => {
  it('compares full statistics years and is null outside the series', () => {
    const prices = flatPrices(80, 40, 2000);
    expect(priceRatioYearsAgo(prices, 'pine_log', 5)).toBe(0.5);
    expect(priceRatioYearsAgo(prices, 'pine_log', 30)).toBeNull();
  });

  it('reads the bundled Luke series', () => {
    const prices = bundledPriceHistory();
    expect(prices.latestYear).toBeGreaterThanOrEqual(2025);
    expect(priceRatioYearsAgo(prices, 'spruce_log', 30)).toBeGreaterThan(0);
  });
});

describe('parsePriceHistory', () => {
  it('maps a json-stat2 response to yearly series', () => {
    const codes = ['TUK_MA', 'TUK_KU', 'TUK_KO', 'KUI_MA', 'KUI_KU', 'KUI_KO'];
    const parsed = parsePriceHistory({
      id: ['INFO', 'KA', 'KAUP', 'PTL'],
      size: [1, 2, 1, 6],
      dimension: {
        INFO: { category: { index: { E_M3: 0 } } },
        KA: { category: { index: { '2024': 0, '2025': 1 } } },
        KAUP: { category: { index: { PKAUP: 0 } } },
        PTL: { category: { index: Object.fromEntries(codes.map((c, i) => [c, i])) } },
      },
      value: [70, 75, 60, 30, 32, null, 80, 83, 66, 31, 33, 31],
    });
    expect(parsed?.latestYear).toBe(2025);
    expect(parsed?.series.pine_log[2024]).toBe(70);
    expect(parsed?.series.birch_pulp[2024]).toBeUndefined();
  });
});

describe('computeValueHistory', () => {
  it('splits the change into growth and price so that they add up', () => {
    const history = computeValueHistory(result([stand()]), flatPrices(80, 60), [5], 2026);
    const [period] = history.periods;
    expect(period.accuracy).toBe('good');
    expect(period.fromYear).toBe(2021);
    expect(period.valueNowEur).toBe(20_000);
    expect(period.growthEffectEur).toBeGreaterThan(0);
    expect(period.priceEffectEur).toBeGreaterThan(0);
    expect(period.growthEffectEur + period.priceEffectEur).toBe(period.changeEur);
    expect(period.valueThenEur + period.changeEur).toBe(period.valueNowEur);
    expect(period.volumeThenM3).toBeLessThan(period.volumeNowM3);
    expect(period.changePct).toBeGreaterThan(0);
    expect(period.annualPct).toBeLessThan(period.changePct as number);
  });

  it('shows no price effect when prices have not changed', () => {
    const [period] = computeValueHistory(result([stand()]), flatPrices(80, 80), [5], 2026).periods;
    expect(period.priceEffectEur).toBe(0);
    expect(period.growthEffectEur).toBe(period.changeEur);
  });

  it('marks long periods rough', () => {
    const [period] = computeValueHistory(result([stand()]), flatPrices(80, 60), [10], 2026).periods;
    expect(period.accuracy).toBe('rough');
    expect(period.note).toMatch(/hakkuita/);
  });

  it('refuses a period during which the forest was regenerated', () => {
    const young = stand({ standId: 's2', meanAgeYears: 15, valueEur: 500, volumeM3: 60 });
    const [ten, twenty] = computeValueHistory(result([young]), flatPrices(80, 60), [10, 20], 2026).periods;
    expect(ten.accuracy).toBe('rough');
    expect(twenty.accuracy).toBe('unavailable');
    expect(twenty.changePct).toBeNull();
    expect(twenty.changeEur).toBe(0);
    expect(twenty.note).toMatch(/uudistettu/);
  });

  it('gives a yearly series up to the longest usable period, ending now', () => {
    const history = computeValueHistory(result([stand()]), flatPrices(80, 60), [1, 5, 10], 2026);
    expect(history.series.map((p) => p.year)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    expect(history.series[history.series.length - 1].valueEur).toBe(20_000);
    expect(history.series[0].valueEur).toBeLessThan(history.series[5].valueEur);
  });

  it('leaves out stands that are not forest land and handles an empty parcel', () => {
    const waste = stand({ isForestLand: false });
    const history = computeValueHistory(result([waste]), flatPrices(80, 60), [5], 2026);
    expect(history.periods[0].accuracy).toBe('unavailable');
    expect(history.series).toEqual([]);
  });
});
