/**
 * Return history ("tuottohistoria"): how much the standing timber and its value have grown
 * over the last 1…30 years, like a fund's return view. There is no measured history of a
 * parcel, so the past is an estimate built from today's stands:
 *
 *  - Volume: each stand is walked back along a growth curve fitted through its present
 *    age and volume, so only the curve's shape (species, site fertility) is assumed.
 *  - Quality: a younger stand had less sawlog; that share of today's sawlog is valued as
 *    pulpwood in the past ("järeytyminen").
 *  - Price: today's price of each assortment is scaled by the change in Luke's national
 *    yearly stumpage prices (priceHistory.ts).
 *  - Harvests: wood sold during the period is added back from the recorded income of the
 *    harvest markings. Income and costs turn the value change into a total return.
 *
 * Still rough: harvests nobody recorded are not known, and a stand younger than the period
 * has no earlier generation. Such periods are flagged rough or unavailable.
 */
import type { PriceHistory } from './priceHistory';
import type {
  ForestValueHistory,
  ForestValueResult,
  HistoryAccuracy,
  HistoryEvent,
  HistoryPeriod,
  HistoryPoint,
  StandGrowth,
  StandValuation,
  TimberAssortment,
  TreeSpecies,
} from './types';

export const HISTORY_PERIODS = [1, 5, 10, 20, 30];
export const FORECAST_YEARS = 10;
const HARVEST_TYPES = ['harvennus', 'avohakkuu'];

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

// Sawlog starts to form at rate·age ≈ 0.9 (30 years on an MT site) and the share levels
// off at ≈ 2.4 (80 years)
const SAWLOG_START = 0.9;
const SAWLOG_FULL = 2.4;

const LOG_TO_PULP: Partial<Record<TimberAssortment, TimberAssortment>> = {
  pine_log: 'pine_pulp',
  spruce_log: 'spruce_pulp',
  birch_log: 'birch_pulp',
};

/** A period is not estimated when this share of the forest was regenerated during it */
const MAX_REGENERATED_SHARE = 0.3;
const ROUGH_FROM_YEARS = 10;
/** The estimate's range grows by this much per year away from today */
const UNCERTAINTY_PER_YEAR = 0.015;
const MAX_UNCERTAINTY = 0.6;

function growthRate(species: TreeSpecies | null, fertilityClass: number | null | undefined): number {
  return (GROWTH_RATE_BY_FERTILITY[fertilityClass ?? 0] ?? DEFAULT_GROWTH_RATE) * SPECIES_RATE_FACTOR[species ?? 'pine'];
}

function curve(ageYears: number, rate: number): number {
  return Math.pow(1 - Math.exp(-rate * ageYears), CURVE_POWER);
}

/**
 * Stand volume `yearsAgo` years ago relative to its volume now. 0 when the stand did not
 * exist yet; above 1 for a negative `yearsAgo` (the future).
 */
export function volumeRatioYearsAgo(
  ageNow: number | null,
  yearsAgo: number,
  species: TreeSpecies | null,
  fertilityClass: number | null | undefined
): number {
  if (yearsAgo === 0) return 1;
  if (ageNow === null || !(ageNow > 0)) return Math.pow(1 + UNKNOWN_AGE_ANNUAL_GROWTH, -yearsAgo);
  const ageThen = ageNow - yearsAgo;
  if (ageThen <= 0) return 0;
  const rate = growthRate(species, fertilityClass);
  return curve(ageThen, rate) / curve(ageNow, rate);
}

/**
 * Sawlog share `yearsAgo` years ago relative to the share now (0…1 for the past).
 * 1 when the age is unknown or the stand has no sawlog yet.
 */
export function sawlogRatioYearsAgo(
  ageNow: number | null,
  yearsAgo: number,
  species: TreeSpecies | null,
  fertilityClass: number | null | undefined
): number {
  if (yearsAgo === 0 || ageNow === null || !(ageNow > 0)) return 1;
  const rate = growthRate(species, fertilityClass);
  const maturity = (age: number) => Math.min(1, Math.max(0, (age * rate - SAWLOG_START) / (SAWLOG_FULL - SAWLOG_START)));
  const now = maturity(ageNow);
  return now > 0 ? maturity(ageNow - yearsAgo) / now : 1;
}

/**
 * Price `yearsAgo` years ago relative to the price now, measured between full statistics
 * years. Null when the series does not reach that far.
 */
export function priceRatioYearsAgo(prices: PriceHistory, assortment: TimberAssortment, yearsAgo: number): number | null {
  if (yearsAgo <= 0) return 1;
  const now = prices.series[assortment][prices.latestYear];
  const then = prices.series[assortment][prices.latestYear - yearsAgo];
  if (!now || !then) return null;
  return then / now;
}

/** Consumer prices `yearsAgo` years ago relative to now (≤ 1 with inflation); null when unknown. */
export function priceLevelYearsAgo(prices: PriceHistory, yearsAgo: number): number | null {
  if (yearsAgo <= 0) return 1;
  const now = prices.costOfLiving?.[prices.latestYear];
  const then = prices.costOfLiving?.[prices.latestYear - yearsAgo];
  if (!now || !then) return null;
  return then / now;
}

interface State {
  volumeM3: number;
  /** That volume with today's assortment mix at today's prices */
  currentMixEur: number;
  /** With that time's assortment mix at today's prices */
  mixEur: number;
  /** With that time's mix and prices: the value then */
  valueEur: number;
  priceKnown: boolean;
}

function standState(stand: StandValuation, prices: PriceHistory, yearsAgo: number): State {
  const growth = volumeRatioYearsAgo(stand.meanAgeYears, yearsAgo, stand.mainSpecies, stand.fertilityClass);
  const quality = sawlogRatioYearsAgo(stand.meanAgeYears, yearsAgo, stand.mainSpecies, stand.fertilityClass);
  const values = stand.valueByAssortment ?? ({} as Record<TimberAssortment, number>);
  const state: State = { volumeM3: stand.volumeM3 * growth, currentMixEur: 0, mixEur: 0, valueEur: 0, priceKnown: true };
  const ratio = (assortment: TimberAssortment) => {
    const r = priceRatioYearsAgo(prices, assortment, yearsAgo);
    if (r === null) state.priceKnown = false;
    return r ?? 1;
  };

  // Value that moves between a species' sawlog and pulpwood as the sawlog share changes
  const shifted: Partial<Record<TimberAssortment, number>> = {};
  for (const [assortment, valueNow] of Object.entries(values) as [TimberAssortment, number][]) {
    const pulp = LOG_TO_PULP[assortment];
    if (!pulp || !valueNow) continue;
    const scaled = valueNow * growth;
    const logPrice = prices.series[assortment][prices.latestYear];
    const pulpPrice = prices.series[pulp][prices.latestYear];
    const pulpPerLog = logPrice && pulpPrice ? pulpPrice / logPrice : 0.4;
    // Looking ahead, sawlog can only grow out of the pulpwood the stand has
    const share =
      quality > 1 ? Math.min(quality, 1 + ((values[pulp] ?? 0) * growth) / (scaled * pulpPerLog)) : quality;
    state.currentMixEur += scaled;
    state.mixEur += scaled * share;
    state.valueEur += scaled * share * ratio(assortment);
    // The rest of that wood was (or will stop being) pulpwood, at the pulpwood price
    shifted[pulp] = scaled * (1 - share) * pulpPerLog;
  }
  for (const [assortment, valueNow] of Object.entries(values) as [TimberAssortment, number][]) {
    if (LOG_TO_PULP[assortment]) continue;
    const scaled = valueNow * growth;
    const withShift = Math.max(0, scaled + (shifted[assortment] ?? 0));
    state.currentMixEur += scaled;
    state.mixEur += withShift;
    state.valueEur += withShift * ratio(assortment);
  }
  return state;
}

function totalState(stands: StandValuation[], prices: PriceHistory, yearsAgo: number): State {
  const total: State = { volumeM3: 0, currentMixEur: 0, mixEur: 0, valueEur: 0, priceKnown: true };
  for (const stand of stands) {
    const s = standState(stand, prices, yearsAgo);
    total.volumeM3 += s.volumeM3;
    total.currentMixEur += s.currentMixEur;
    total.mixEur += s.mixEur;
    total.valueEur += s.valueEur;
    total.priceKnown = total.priceKnown && s.priceKnown;
  }
  return total;
}

function accuracyFor(
  stands: StandValuation[],
  yearsAgo: number,
  valueNowEur: number,
  priceKnown: boolean,
  unrecordedHarvests: number
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
  if (unrecordedHarvests > 0) {
    return {
      accuracy: 'rough',
      note: 'Jaksolla on hakkuu, jonka puukauppatuloa ei ole kirjattu, joten hakattu puusto puuttuu arviosta. Lisää tulo tehtyihin töihin.',
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
    return { accuracy: 'rough', note: 'Pitkällä jaksolla arvio on suuntaa antava: kirjaamattomia hakkuita ei tunneta.' };
  }
  return { accuracy: 'good', note: null };
}

const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (ratio: number) => round1((ratio - 1) * 100);
const annual = (ratio: number, years: number) => (ratio > 0 ? round1((Math.pow(ratio, 1 / years) - 1) * 100) : null);

/** Whole years between an ISO date and now, never negative */
function yearsSince(date: string, now: Date): number {
  return Math.max(0, (now.getTime() - new Date(date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

/**
 * Periods, a yearly value series, a forecast and stand growth from a computed forest value.
 * `events` are the parcel's done works (markings); `recorded` is filled in by the caller.
 */
export function computeValueHistory(
  result: ForestValueResult,
  prices: PriceHistory,
  periods: number[] = HISTORY_PERIODS,
  now: Date = new Date(),
  events: HistoryEvent[] = []
): ForestValueHistory {
  const currentYear = now.getFullYear();
  const stands = result.stands.filter((s) => s.isForestLand);
  const states = new Map<number, State>();
  const stateAt = (yearsAgo: number) => {
    let state = states.get(yearsAgo);
    if (!state) states.set(yearsAgo, (state = totalState(stands, prices, yearsAgo)));
    return state;
  };
  const today = stateAt(0);
  const baseUncertainty = result.value?.uncertainty ?? 0.15;
  const dated = events
    .filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.date))
    .map((e) => ({ ...e, yearsAgo: yearsSince(e.date, now) }));

  const computed: HistoryPeriod[] = periods.map((years) => {
    const then = stateAt(years);
    const inPeriod = dated.filter((e) => e.yearsAgo < years);

    // Wood sold in harvests during the period existed at its start: add it back, taken from
    // the harvest's income to the start of the period by the parcel's own growth and prices
    let harvestedEur = 0;
    let harvestedM3 = 0;
    let unrecordedHarvests = 0;
    for (const event of inPeriod.filter((e) => HARVEST_TYPES.includes(e.type))) {
      if (!event.incomeEur) {
        unrecordedHarvests++;
        continue;
      }
      const atHarvest = stateAt(Math.min(years, Math.round(event.yearsAgo)));
      const volumeFactor = atHarvest.volumeM3 > 0 ? then.volumeM3 / atHarvest.volumeM3 : 1;
      const priceThen = then.mixEur > 0 ? then.valueEur / then.mixEur : 1;
      const priceAtHarvest = atHarvest.mixEur > 0 ? atHarvest.valueEur / atHarvest.mixEur : 1;
      harvestedEur += event.incomeEur * volumeFactor * (priceAtHarvest > 0 ? priceThen / priceAtHarvest : 1);
      if (atHarvest.valueEur > 0) harvestedM3 += (event.incomeEur / (atHarvest.valueEur / atHarvest.volumeM3)) * volumeFactor;
    }

    const { accuracy, note } = accuracyFor(stands, years, today.valueEur, then.priceKnown, unrecordedHarvests);
    const usable = accuracy !== 'unavailable';
    const valueThen = then.valueEur + harvestedEur;
    const incomeEur = Math.round(inPeriod.reduce((sum, e) => sum + (e.incomeEur ?? 0), 0));
    const costEur = Math.round(inPeriod.reduce((sum, e) => sum + (e.costEur ?? 0), 0));

    const changeEur = Math.round(today.valueEur - valueThen);
    const growthEffectEur = Math.round(today.valueEur - then.currentMixEur);
    const qualityEffectEur = Math.round(then.currentMixEur - then.mixEur);
    const harvested = 0 - Math.round(harvestedEur);
    const totalReturnEur = changeEur + incomeEur - costEur;
    const hasBase = usable && valueThen > 0;
    const totalRatio = hasBase ? (today.valueEur + incomeEur - costEur) / valueThen : 0;
    const level = priceLevelYearsAgo(prices, years);

    return {
      years,
      fromYear: currentYear - years,
      accuracy,
      note,
      volumeThenM3: usable ? round1(then.volumeM3 + harvestedM3) : 0,
      volumeNowM3: round1(today.volumeM3),
      valueThenEur: usable ? Math.round(valueThen) : 0,
      valueNowEur: Math.round(today.valueEur),
      changeEur: usable ? changeEur : 0,
      changePct: hasBase ? pct(today.valueEur / valueThen) : null,
      annualPct: hasBase ? annual(today.valueEur / valueThen, years) : null,
      growthEffectEur: usable ? growthEffectEur : 0,
      qualityEffectEur: usable ? qualityEffectEur : 0,
      // The remainder, so the parts always add up to the change
      priceEffectEur: usable ? changeEur - growthEffectEur - qualityEffectEur - harvested : 0,
      harvestedEur: usable ? harvested : 0,
      incomeEur,
      costEur,
      totalReturnEur: usable ? totalReturnEur : 0,
      totalReturnPct: hasBase ? pct(totalRatio) : null,
      totalAnnualPct: hasBase ? annual(totalRatio, years) : null,
      inflationPct: level !== null ? pct(1 / level) : null,
      realTotalReturnPct: hasBase && level !== null ? pct(totalRatio * level) : null,
      realTotalAnnualPct: hasBase && level !== null ? annual(totalRatio * level, years) : null,
      unrecordedHarvests,
    };
  });

  const point = (yearsAgo: number, valueEur: number, volumeM3: number): HistoryPoint => {
    const uncertainty = Math.min(MAX_UNCERTAINTY, baseUncertainty + UNCERTAINTY_PER_YEAR * Math.abs(yearsAgo));
    return {
      year: currentYear - yearsAgo,
      volumeM3: round1(volumeM3),
      valueEur: Math.round(valueEur),
      lowEur: Math.round(valueEur * (1 - uncertainty)),
      highEur: Math.round(valueEur * (1 + uncertainty)),
      priceLevel: priceLevelYearsAgo(prices, yearsAgo) ?? 1,
    };
  };

  const longest = Math.max(0, ...computed.filter((p) => p.accuracy !== 'unavailable').map((p) => p.years));
  const series: HistoryPoint[] = [];
  for (let years = longest; years >= 0 && longest > 0; years--) {
    const state = stateAt(years);
    series.push(point(years, state.valueEur, state.volumeM3));
  }
  // The future at today's prices: growth and sawlog share only
  const forecast: HistoryPoint[] = [];
  for (let years = 1; years <= FORECAST_YEARS && today.valueEur > 0; years++) {
    const state = stateAt(-years);
    forecast.push(point(-years, state.mixEur, state.volumeM3));
  }

  const standGrowth: StandGrowth[] = stands
    .map((stand) => {
      const lastYear = standState(stand, prices, 1);
      return {
        standId: stand.standId,
        standNumber: stand.standNumber,
        areaHa: round1(stand.areaHaInParcel),
        ageYears: stand.meanAgeYears,
        mainSpecies: stand.mainSpecies,
        developmentClass: stand.developmentClass,
        volumeNowM3: round1(stand.volumeM3),
        valueNowEur: Math.round(stand.valueEur),
        volumeGrowthPct: lastYear.volumeM3 > 0 ? pct(stand.volumeM3 / lastYear.volumeM3) : 0,
        valueGrowthPct: lastYear.mixEur > 0 && stand.valueEur > 0 ? pct(stand.valueEur / lastYear.mixEur) : null,
      };
    })
    .sort((a, b) => b.valueNowEur - a.valueNowEur);

  return {
    propertyId: result.propertyId,
    forestAreaHa: round1(stands.reduce((sum, s) => sum + s.areaHaInParcel, 0)),
    periods: computed,
    series,
    forecast,
    events: dated
      .map(({ date, type, title, incomeEur, costEur }) => ({ date, type, title, incomeEur, costEur }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    stands: standGrowth,
    recorded: [],
    provider: result.data.provider,
    priceSource: prices.source,
    priceYears: { from: prices.latestYear - Math.max(...periods, 0), to: prices.latestYear },
    computedAt: now.toISOString(),
  };
}
