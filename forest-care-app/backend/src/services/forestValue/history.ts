/**
 * Return history ("tuottohistoria"): how much the standing timber and its value have grown
 * over the last 1…30 years. There is no measured history of a parcel, so the past is an
 * estimate built from today's stands:
 *
 *  - Volume: each stand is walked back along a growth curve fitted through its present
 *    age and volume, so only the curve's shape (species, site fertility) is assumed.
 *  - Price: today's price of each assortment is scaled by the change in Luke's national
 *    yearly stumpage prices (priceHistory.ts).
 *
 * Simplifications, all leaning towards "rough": past harvests are not known, the sawlog
 * share is kept as it is today, and a stand younger than the period has no earlier
 * generation. Long periods are therefore flagged rough or unavailable.
 */
import type { PriceHistory } from './priceHistory';
import type {
  ForestValueHistory,
  ForestValueResult,
  HistoryAccuracy,
  HistoryPeriod,
  HistoryPoint,
  StandValuation,
  TimberAssortment,
  TreeSpecies,
} from './types';

export const HISTORY_PERIODS = [1, 5, 10, 20, 30];

// Chapman–Richards yield curve V(t) ∝ (1 − e^(−k·t))^p. Faster k = earlier culmination.
const CURVE_POWER = 3;
/** k by site fertility class (1 lehto … 8 lakimetsä); MT (3) is the reference */
const GROWTH_RATE_BY_FERTILITY: Record<number, number> = {
  1: 0.036, 2: 0.034, 3: 0.03, 4: 0.026, 5: 0.022, 6: 0.019, 7: 0.017, 8: 0.015,
};
const DEFAULT_GROWTH_RATE = 0.028;
/** Deciduous trees grow fast young and level off earlier than conifers */
const SPECIES_RATE_FACTOR: Record<TreeSpecies, number> = { pine: 1, spruce: 1, birch: 1.25, other_deciduous: 1.3 };
/** Stands without an age: plain compound growth, % per year */
const UNKNOWN_AGE_ANNUAL_GROWTH = 0.03;

/** A period is not estimated when this share of the forest was regenerated during it */
const MAX_REGENERATED_SHARE = 0.3;
const ROUGH_FROM_YEARS = 10;

function curve(ageYears: number, rate: number): number {
  return Math.pow(1 - Math.exp(-rate * ageYears), CURVE_POWER);
}

/**
 * Stand volume `yearsAgo` years ago relative to its volume now (0…1).
 * 0 when the stand did not exist yet.
 */
export function volumeRatioYearsAgo(
  ageNow: number | null,
  yearsAgo: number,
  species: TreeSpecies | null,
  fertilityClass: number | null | undefined
): number {
  if (yearsAgo <= 0) return 1;
  if (ageNow === null || !(ageNow > 0)) return Math.pow(1 + UNKNOWN_AGE_ANNUAL_GROWTH, -yearsAgo);
  const ageThen = ageNow - yearsAgo;
  if (ageThen <= 0) return 0;
  const rate =
    (GROWTH_RATE_BY_FERTILITY[fertilityClass ?? 0] ?? DEFAULT_GROWTH_RATE) * SPECIES_RATE_FACTOR[species ?? 'pine'];
  return curve(ageThen, rate) / curve(ageNow, rate);
}

/**
 * Price `yearsAgo` years ago relative to the price now, measured between full statistics
 * years. Null when the series does not reach that far.
 */
export function priceRatioYearsAgo(prices: PriceHistory, assortment: TimberAssortment, yearsAgo: number): number | null {
  const now = prices.series[assortment][prices.latestYear];
  const then = prices.series[assortment][prices.latestYear - yearsAgo];
  if (!now || !then) return null;
  return then / now;
}

interface PastState {
  volumeM3: number;
  /** Past volume at today's prices */
  valueAtCurrentPricesEur: number;
  valueEur: number;
  priceKnown: boolean;
}

function stateYearsAgo(stands: StandValuation[], prices: PriceHistory, yearsAgo: number): PastState {
  const state: PastState = { volumeM3: 0, valueAtCurrentPricesEur: 0, valueEur: 0, priceKnown: true };
  for (const stand of stands) {
    const growth = volumeRatioYearsAgo(stand.meanAgeYears, yearsAgo, stand.mainSpecies, stand.fertilityClass);
    state.volumeM3 += stand.volumeM3 * growth;
    for (const [assortment, valueNow] of Object.entries(stand.valueByAssortment ?? {}) as [TimberAssortment, number][]) {
      if (!valueNow) continue;
      const ratio = priceRatioYearsAgo(prices, assortment, yearsAgo);
      if (ratio === null) state.priceKnown = false;
      state.valueAtCurrentPricesEur += valueNow * growth;
      state.valueEur += valueNow * growth * (ratio ?? 1);
    }
  }
  return state;
}

function accuracyFor(
  stands: StandValuation[],
  yearsAgo: number,
  valueNowEur: number,
  priceKnown: boolean
): { accuracy: HistoryAccuracy; note: string | null } {
  if (stands.length === 0 || valueNowEur <= 0) {
    return { accuracy: 'unavailable', note: 'Palstalla ei ole puustoa, jolle voisi laskea arvon.' };
  }
  const area = stands.reduce((sum, s) => sum + s.areaHaInParcel, 0);
  const share = (filter: (s: StandValuation) => boolean) =>
    area > 0 ? stands.filter(filter).reduce((sum, s) => sum + s.areaHaInParcel, 0) / area : 0;
  const regenerated = share((s) => s.meanAgeYears !== null && s.meanAgeYears <= yearsAgo);
  const unknownAge = share((s) => s.meanAgeYears === null);

  if (regenerated > MAX_REGENERATED_SHARE) {
    return {
      accuracy: 'unavailable',
      note: `Liian epävarma arvioitavaksi: ${Math.round(regenerated * 100)} % metsästä on uudistettu jakson aikana, eikä aiemman puuston määrää tiedetä.`,
    };
  }
  if (!priceKnown) {
    return { accuracy: 'rough', note: 'Hintatilasto ei ulotu jakson alkuun, joten hinnan muutosta ei ole huomioitu.' };
  }
  if (regenerated > 0) {
    return { accuracy: 'rough', note: 'Osa kuvioista on uudistettu jakson aikana. Niiden aiempaa puustoa ei ole mukana.' };
  }
  if (unknownAge > 0.5) {
    return { accuracy: 'rough', note: 'Suurelta osalta metsää puuttuu puuston ikä, joten kasvu on arvioitu keskimääräisenä.' };
  }
  if (yearsAgo >= ROUGH_FROM_YEARS) {
    return { accuracy: 'rough', note: 'Pitkällä jaksolla arvio on suuntaa antava: aiempia hakkuita ei tunneta.' };
  }
  return { accuracy: 'good', note: null };
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Periods and a yearly value series from a computed forest value. `recorded` (values the app
 * has stored) is filled in by the caller.
 */
export function computeValueHistory(
  result: ForestValueResult,
  prices: PriceHistory,
  periods: number[] = HISTORY_PERIODS,
  currentYear: number = new Date().getFullYear()
): ForestValueHistory {
  const stands = result.stands.filter((s) => s.isForestLand);
  const now = stateYearsAgo(stands, prices, 0);

  const computed: HistoryPeriod[] = periods.map((years) => {
    const then = stateYearsAgo(stands, prices, years);
    const { accuracy, note } = accuracyFor(stands, years, now.valueEur, then.priceKnown);
    const usable = accuracy !== 'unavailable';
    const changeEur = Math.round(now.valueEur - then.valueEur);
    const growthEffectEur = Math.round(now.valueEur - then.valueAtCurrentPricesEur);
    const hasBase = usable && then.valueEur > 0;
    return {
      years,
      fromYear: currentYear - years,
      accuracy,
      note,
      volumeThenM3: usable ? round1(then.volumeM3) : 0,
      volumeNowM3: round1(now.volumeM3),
      valueThenEur: usable ? Math.round(then.valueEur) : 0,
      valueNowEur: Math.round(now.valueEur),
      changeEur: usable ? changeEur : 0,
      changePct: hasBase ? round1((now.valueEur / then.valueEur - 1) * 100) : null,
      annualPct: hasBase ? round1((Math.pow(now.valueEur / then.valueEur, 1 / years) - 1) * 100) : null,
      growthEffectEur: usable ? growthEffectEur : 0,
      // The remainder, so the two effects always add up to the change
      priceEffectEur: usable ? changeEur - growthEffectEur : 0,
    };
  });

  const longest = Math.max(0, ...computed.filter((p) => p.accuracy !== 'unavailable').map((p) => p.years));
  const series: HistoryPoint[] = [];
  for (let years = longest; years >= 0 && longest > 0; years--) {
    const state = stateYearsAgo(stands, prices, years);
    series.push({ year: currentYear - years, volumeM3: round1(state.volumeM3), valueEur: Math.round(state.valueEur) });
  }

  return {
    propertyId: result.propertyId,
    periods: computed,
    series,
    recorded: [],
    provider: result.data.provider,
    priceSource: prices.source,
    priceYears: { from: prices.latestYear - Math.max(...periods, 0), to: prices.latestYear },
    computedAt: new Date().toISOString(),
  };
}
