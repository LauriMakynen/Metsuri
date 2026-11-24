import { describe, expect, it } from 'vitest';
import {
  computeValueHistory,
  priceLevelYearsAgo,
  priceRatioYearsAgo,
  sawlogRatioYearsAgo,
  volumeRatioYearsAgo,
} from '../history';
import { bundledPriceHistory, parseCostOfLiving, parsePriceHistory, type PriceHistory } from '../priceHistory';
import type { ForestValueResult, HistoryEvent, StandValuation, TimberAssortment } from '../types';

const ASSORTMENTS: TimberAssortment[] = ['pine_log', 'spruce_log', 'birch_log', 'pine_pulp', 'spruce_pulp', 'birch_pulp'];
const NOW = new Date('2026-06-15T12:00:00Z');

/**
 * Sawlog costs `log` and pulpwood `pulp` in 2025; every earlier year both cost `thenShare`
 * of that. Consumer prices rise 2 % a year.
 */
function testPrices(thenShare = 1, log = 80, pulp = 80, firstYear = 1990): PriceHistory {
  const series = {} as PriceHistory['series'];
  for (const a of ASSORTMENTS) {
    const now = a.endsWith('_log') ? log : pulp;
    series[a] = {};
    for (let year = firstYear; year < 2025; year++) series[a][year] = now * thenShare;
    series[a][2025] = now;
  }
  const costOfLiving: Record<number, number> = {};
  for (let year = firstYear; year <= 2025; year++) costOfLiving[year] = 100 * Math.pow(1.02, year - firstYear);
  return { source: 'bundled', latestYear: 2025, series, costOfLiving };
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
    value: { lowEur: 0, midEur: 0, highEur: 0, uncertainty: 0.15 },
    data: { provider: 'metsakeskus', inventoryYearMin: 2024, inventoryYearMax: 2024, isOutdated: false },
  } as unknown as ForestValueResult;
}

function event(overrides: Partial<HistoryEvent>): HistoryEvent {
  return { date: '2024-06-15', type: 'harvennus', title: 'Harvennus', incomeEur: null, costEur: null, ...overrides };
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

  it('looks ahead with a negative number of years', () => {
    expect(volumeRatioYearsAgo(40, -5, 'pine', 3)).toBeGreaterThan(1);
  });
});

describe('sawlogRatioYearsAgo', () => {
  it('had less sawlog when the stand was younger, none before sawlog size', () => {
    expect(sawlogRatioYearsAgo(60, 10, 'pine', 3)).toBeLessThan(1);
    expect(sawlogRatioYearsAgo(60, 10, 'pine', 3)).toBeGreaterThan(0);
    expect(sawlogRatioYearsAgo(40, 15, 'pine', 3)).toBe(0);
  });

  it('does not change in an old stand or without an age', () => {
    expect(sawlogRatioYearsAgo(100, 10, 'pine', 3)).toBe(1);
    expect(sawlogRatioYearsAgo(null, 10, 'pine', 3)).toBe(1);
  });
});

describe('price series', () => {
  it('compares full statistics years and is null outside the series', () => {
    const prices = testPrices(0.5, 80, 80, 2000);
    expect(priceRatioYearsAgo(prices, 'pine_log', 5)).toBe(0.5);
    expect(priceRatioYearsAgo(prices, 'pine_log', 30)).toBeNull();
    expect(priceLevelYearsAgo(prices, 10)).toBeCloseTo(Math.pow(1.02, -10), 6);
    expect(priceLevelYearsAgo(prices, 30)).toBeNull();
  });

  it('reads the bundled Luke and Statistics Finland series', () => {
    const prices = bundledPriceHistory();
    expect(prices.latestYear).toBeGreaterThanOrEqual(2025);
    expect(priceRatioYearsAgo(prices, 'spruce_log', 30)).toBeGreaterThan(0);
    expect(priceLevelYearsAgo(prices, 30)).toBeLessThan(1);
  });

  it('maps a json-stat2 price response to yearly series', () => {
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

  it('maps the cost-of-living response', () => {
    const index = parseCostOfLiving({
      dimension: { timeperiod_y: { category: { index: { '1989': 0, '2024': 1, '2025': 2 } } } },
      value: [1000, 2332, 2339],
    });
    expect(index).toEqual({ 2024: 2332, 2025: 2339 });
  });
});

describe('computeValueHistory', () => {
  it('splits the change into growth, quality and price so that they add up', () => {
    const history = computeValueHistory(result([stand()]), testPrices(0.75, 80, 30), [5], NOW);
    const [period] = history.periods;
    expect(period.accuracy).toBe('good');
    expect(period.fromYear).toBe(2021);
    expect(period.valueNowEur).toBe(20_000);
    expect(period.growthEffectEur).toBeGreaterThan(0);
    expect(period.qualityEffectEur).toBeGreaterThan(0);
    expect(period.priceEffectEur).toBeGreaterThan(0);
    expect(period.harvestedEur).toBe(0);
    expect(period.growthEffectEur + period.qualityEffectEur + period.priceEffectEur).toBe(period.changeEur);
    expect(period.valueThenEur + period.changeEur).toBe(period.valueNowEur);
    expect(period.volumeThenM3).toBeLessThan(period.volumeNowM3);
    expect(period.annualPct).toBeLessThan(period.changePct as number);
    // No money recorded: the total return is the value change
    expect(period.totalReturnEur).toBe(period.changeEur);
  });

  it('shows no price effect when prices have not changed', () => {
    const [period] = computeValueHistory(result([stand()]), testPrices(1, 80, 30), [5], NOW).periods;
    expect(period.priceEffectEur).toBe(0);
    expect(period.growthEffectEur + period.qualityEffectEur).toBe(period.changeEur);
  });

  it('takes inflation out of the real return', () => {
    const [period] = computeValueHistory(result([stand()]), testPrices(0.75), [5], NOW).periods;
    expect(period.inflationPct).toBeCloseTo((Math.pow(1.02, 5) - 1) * 100, 0);
    expect(period.realTotalReturnPct).toBeLessThan(period.totalReturnPct as number);
    expect(period.realTotalAnnualPct).toBeLessThan(period.totalAnnualPct as number);
  });

  it('marks long periods rough', () => {
    const [period] = computeValueHistory(result([stand()]), testPrices(0.75), [10], NOW).periods;
    expect(period.accuracy).toBe('rough');
    expect(period.note).toMatch(/hakkuita/);
  });

  it('refuses a period during which the forest was regenerated', () => {
    const young = stand({ standId: 's2', meanAgeYears: 15, valueEur: 500, volumeM3: 60 });
    const [ten, twenty] = computeValueHistory(result([young]), testPrices(0.75), [10, 20], NOW).periods;
    expect(ten.accuracy).toBe('rough');
    expect(twenty.accuracy).toBe('unavailable');
    expect(twenty.changePct).toBeNull();
    expect(twenty.changeEur).toBe(0);
    expect(twenty.totalReturnEur).toBe(0);
    expect(twenty.note).toMatch(/uudistettu/);
  });

  it('adds harvested wood back and counts income and costs in the total return', () => {
    const plain = computeValueHistory(result([stand()]), testPrices(1), [5], NOW).periods[0];
    const events = [
      event({ date: '2024-06-15', incomeEur: 6_000 }),
      event({ date: '2023-05-01', type: 'vesakonhoito', title: 'Raivaus', costEur: 800 }),
      // Outside the period: ignored
      event({ date: '2015-01-01', incomeEur: 9_000 }),
    ];
    const [period] = computeValueHistory(result([stand()]), testPrices(1), [5], NOW, events).periods;
    expect(period.incomeEur).toBe(6_000);
    expect(period.costEur).toBe(800);
    expect(period.harvestedEur).toBeLessThan(0);
    // The sold wood was standing at the start, so the value change is smaller than without the harvest
    expect(period.valueThenEur).toBeGreaterThan(plain.valueThenEur);
    expect(period.volumeThenM3).toBeGreaterThan(plain.volumeThenM3);
    expect(period.changeEur).toBeLessThan(plain.changeEur);
    expect(period.growthEffectEur + period.qualityEffectEur + period.priceEffectEur + period.harvestedEur).toBe(
      period.changeEur
    );
    expect(period.totalReturnEur).toBe(period.changeEur + 6_000 - 800);
    expect(period.accuracy).toBe('good');
  });

  it('flags a harvest without recorded income', () => {
    const [period] = computeValueHistory(result([stand()]), testPrices(1), [5], NOW, [event({})]).periods;
    expect(period.unrecordedHarvests).toBe(1);
    expect(period.accuracy).toBe('rough');
    expect(period.note).toMatch(/puukauppatuloa/);
  });

  it('gives a yearly series with a widening range, ending now', () => {
    const history = computeValueHistory(result([stand()]), testPrices(0.75), [1, 5, 10], NOW);
    expect(history.series.map((p) => p.year)).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
    const first = history.series[0];
    const last = history.series[history.series.length - 1];
    expect(last.valueEur).toBe(20_000);
    expect(last.priceLevel).toBe(1);
    expect(first.priceLevel).toBeLessThan(1);
    expect(first.valueEur).toBeLessThan(history.series[5].valueEur);
    expect((first.highEur - first.lowEur) / first.valueEur).toBeGreaterThan((last.highEur - last.lowEur) / last.valueEur);
  });

  it('projects the coming years at today\'s prices', () => {
    const history = computeValueHistory(result([stand()]), testPrices(0.75, 80, 30), [5], NOW);
    expect(history.forecast.map((p) => p.year)).toEqual([2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036]);
    expect(history.forecast[0].valueEur).toBeGreaterThan(20_000);
    expect(history.forecast[9].valueEur).toBeGreaterThan(history.forecast[0].valueEur);
    // Sawlog can only grow out of the stand's own pulpwood: value stays below "all sawlog"
    expect(history.forecast[9].valueEur).toBeLessThan(history.forecast[9].volumeM3 * 80);
  });

  it('lists how fast each stand is gaining value, most valuable first', () => {
    const young = stand({ standId: 'young', meanAgeYears: 30, valueEur: 3_000, volumeM3: 150,
      valueByAssortment: { pine_log: 0, spruce_log: 0, birch_log: 0, pine_pulp: 3_000, spruce_pulp: 0, birch_pulp: 0 } });
    const old = stand({ standId: 'old', meanAgeYears: 100, valueEur: 40_000, volumeM3: 700,
      valueByAssortment: { pine_log: 35_000, spruce_log: 0, birch_log: 0, pine_pulp: 5_000, spruce_pulp: 0, birch_pulp: 0 } });
    const history = computeValueHistory(result([young, old]), testPrices(1, 80, 30), [5], NOW);
    expect(history.stands.map((s) => s.standId)).toEqual(['old', 'young']);
    expect(history.stands[1].volumeGrowthPct).toBeGreaterThan(history.stands[0].volumeGrowthPct);
    expect(history.stands[0].valueGrowthPct).toBeLessThan(2);
    expect(history.forestAreaHa).toBe(4);
  });

  it('leaves out stands that are not forest land and handles an empty parcel', () => {
    const waste = stand({ isForestLand: false });
    const history = computeValueHistory(result([waste]), testPrices(0.75), [5], NOW);
    expect(history.periods[0].accuracy).toBe('unavailable');
    expect(history.series).toEqual([]);
    expect(history.forecast).toEqual([]);
    expect(history.stands).toEqual([]);
  });
});
