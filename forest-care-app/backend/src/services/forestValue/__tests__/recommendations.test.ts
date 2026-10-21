import { describe, expect, it } from 'vitest';
import { RULES, THRESHOLDS, type RecommendationRule } from '../recommendationRules';
import {
  TIMING_OFFSET_YEARS,
  recommendOperations,
  recommendOperationsForStand,
  standContext,
  timingFromYears,
} from '../recommendations';
import { PRICES, clipped, stand, stratum } from './fixtures';

const YEAR = 2026;

function recommend(...args: Parameters<typeof stand>) {
  return recommendOperationsForStand(clipped(stand(...args)), PRICES, YEAR);
}

describe('timingFromYears', () => {
  it('maps every representative offset back to its own class', () => {
    for (const [timing, offset] of Object.entries(TIMING_OFFSET_YEARS)) {
      expect(timingFromYears(offset)).toBe(timing);
    }
  });

  it('buckets years into timing classes', () => {
    expect(timingFromYears(-2)).toBe('now');
    expect(timingFromYears(0)).toBe('now');
    expect(timingFromYears(2)).toBe('1-3y');
    expect(timingFromYears(5)).toBe('3-5y');
    expect(timingFromYears(8)).toBe('5-10y');
    expect(timingFromYears(15)).toBe('10y+');
  });
});

describe('rule-based recommendations', () => {
  it('suggests young stand management now for a dense seedling stand', () => {
    const [op] = recommend({
      developmentClass: 'T2',
      meanAgeYears: 10,
      stemsPerHa: 4000,
      strata: [stratum({ volumeM3PerHa: 10 })],
    });
    expect(op.type).toBe('young_stand_management');
    expect(op.timing).toBe('now');
    expect(op.reason).toContain('4');
    expect(op.estimatedIncomeEur).toBeNull();
  });

  it('only suggests a check for a seedling stand of normal density', () => {
    const [op] = recommend({ developmentClass: 'T2', stemsPerHa: 2000, strata: [stratum({ volumeM3PerHa: 10 })] });
    expect(op.type).toBe('young_stand_management');
    expect(op.timing).toBe('1-3y');
  });

  it('suggests early care for small seedlings', () => {
    const [op] = recommend({ developmentClass: 'T1', strata: [] });
    expect(op.type).toBe('brush_clearing');
  });

  it('times first thinning by mean height', () => {
    const tall = recommend({ developmentClass: '02', strata: [stratum({ meanHeightM: 13, sawlogM3PerHa: 5, pulpwoodM3PerHa: 80 })] });
    expect(tall[0].type).toBe('first_thinning');
    expect(tall[0].timing).toBe('now');
    expect(tall[0].estimatedRemovalM3).toBeGreaterThan(0);
    expect(tall[0].estimatedIncomeEur).toBeGreaterThan(0);

    const short = recommend({ developmentClass: '02', strata: [stratum({ meanHeightM: 8 })] });
    expect(short[0].timing).toBe('3-5y');
  });

  it('falls back to age when height is unknown', () => {
    const [op] = recommend({ developmentClass: '02', meanAgeYears: 32, mainSpecies: 'pine', strata: [stratum({ species: 'pine' })] });
    expect(op.type).toBe('first_thinning');
    expect(op.timing).toBe('1-3y');
  });

  it('suggests thinning when basal area exceeds the threshold', () => {
    const [op] = recommend({ developmentClass: '03', meanAgeYears: 45, basalAreaM2PerHa: THRESHOLDS.thinningBasalArea.spruce + 1 });
    expect(op.type).toBe('thinning');
    expect(op.timing).toBe('now');
    expect(op.year).toBe(YEAR);
  });

  it('skips thinning for a maturing stand close to regeneration age', () => {
    const ops = recommend({ developmentClass: '03', meanAgeYears: 65, mainSpecies: 'spruce' });
    expect(ops.map((o) => o.type)).toEqual(['clear_cut', 'soil_preparation', 'planting']);
    expect(ops[0].timing).toBe('5-10y');
  });

  it('suggests regeneration cut with soil preparation and planting afterwards', () => {
    const ops = recommend({ developmentClass: '04', meanAgeYears: 85 });
    expect(ops.map((o) => o.type)).toEqual(['clear_cut', 'soil_preparation', 'planting']);
    expect(ops[0].timing).toBe('now');
    expect(ops[1].year).toBe(YEAR + 1);
    // 95 % of 150 m³/ha
    expect(ops[0].estimatedRemovalM3).toBe(143);
    expect(ops[0].estimatedIncomeEur).toBe(Math.round((9_200 * 0.95) / 10) * 10);
  });

  it('mentions seed tree cutting for pine on dry sites', () => {
    const [op] = recommend({ developmentClass: '04', mainSpecies: 'pine', fertilityClass: 4, strata: [stratum({ species: 'pine' })] });
    expect(op.reason).toContain('siemenpuuhakkuu');
  });

  it('suggests selection cut for uneven-aged stands', () => {
    const [op] = recommend({ developmentClass: 'ER', basalAreaM2PerHa: 24 });
    expect(op.type).toBe('selection_cut');
    expect(op.timing).toBe('1-3y');
  });

  it('gives nothing for non-forest land or tiny stands', () => {
    expect(recommend({ isForestLand: false })).toEqual([]);
    expect(recommendOperationsForStand(clipped(stand(), 0.01), PRICES, YEAR)).toEqual([]);
  });
});

describe('Metsäkeskus proposals', () => {
  it('take precedence over the rules', () => {
    const ops = recommend({
      developmentClass: '03',
      basalAreaM2PerHa: 10, // rules would say thinning in 5–10 years
      proposedOperations: [{ type: 'thinning', year: 2027 }],
    });
    expect(ops).toHaveLength(1);
    expect(ops[0].source).toBe('metsakeskus');
    expect(ops[0].year).toBe(2027);
    expect(ops[0].timing).toBe('1-3y');
  });

  it('show overdue proposals as due now', () => {
    const [op] = recommend({ developmentClass: '03', proposedOperations: [{ type: 'thinning', year: 2022 }] });
    expect(op.year).toBe(YEAR);
    expect(op.timing).toBe('now');
  });

  it('add derived follow-ups unless the source already proposes them', () => {
    const derived = recommend({ developmentClass: '04', proposedOperations: [{ type: 'clear_cut', year: 2028 }] });
    expect(derived.map((o) => [o.type, o.source, o.year])).toEqual([
      ['clear_cut', 'metsakeskus', 2028],
      ['soil_preparation', 'rules', 2029],
      ['planting', 'rules', 2029],
    ]);

    const explicit = recommend({
      developmentClass: '04',
      proposedOperations: [
        { type: 'clear_cut', year: 2028 },
        { type: 'planting', year: 2030 },
      ],
    });
    expect(explicit.map((o) => o.type)).toEqual(['clear_cut', 'soil_preparation', 'planting']);
    expect(explicit.filter((o) => o.type === 'planting')[0].source).toBe('metsakeskus');
  });
});

describe('recommendOperations', () => {
  it('sorts by year and stand number', () => {
    const ops = recommendOperations(
      [
        clipped(stand({ id: 'b', standNumber: '10', developmentClass: '03', meanAgeYears: 45, basalAreaM2PerHa: 30 })),
        clipped(stand({ id: 'a', standNumber: '2', developmentClass: '03', meanAgeYears: 45, basalAreaM2PerHa: 30 })),
        clipped(stand({ id: 'c', standNumber: '1', developmentClass: 'ER', basalAreaM2PerHa: 10 })),
      ],
      PRICES,
      YEAR
    );
    expect(ops.map((o) => o.standNumber)).toEqual(['2', '10', '1']);
  });

  it('accepts a custom rule set', () => {
    const custom: RecommendationRule[] = [
      { id: 'always-check', operation: 'brush_clearing', when: () => true, timing: () => '3-5y', reason: () => 'Testi' },
    ];
    const ops = recommendOperations([clipped(stand())], PRICES, YEAR, custom);
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'brush_clearing', year: YEAR + 4, reason: 'Testi' });
  });
});

describe('standContext', () => {
  it('derives main species and height from strata when missing', () => {
    const ctx = standContext(
      stand({
        mainSpecies: null,
        meanAgeYears: null,
        strata: [
          stratum({ species: 'birch', volumeM3PerHa: 20 }),
          stratum({ species: 'pine', volumeM3PerHa: 80, meanHeightM: 15, meanAgeYears: 40 }),
        ],
      })
    );
    expect(ctx.species).toBe('pine');
    expect(ctx.meanHeightM).toBe(15);
    expect(ctx.ageYears).toBe(40);
    expect(ctx.volumeM3PerHa).toBe(100);
  });

  it('keeps every rule id unique', () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
