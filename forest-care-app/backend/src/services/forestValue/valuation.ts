/**
 * Timber value calculation for a forest parcel.
 *
 * Pure functions only: no I/O, so everything here is unit tested.
 *
 * Method (stumpage value, "kantoraha-arvo"):
 *   value = Σ stands Σ strata (sawlog m³/ha × price_log + pulpwood m³/ha × price_pulp) × area in parcel
 *
 * Assumptions:
 *  - Prices are stumpage prices (kantohinnat) for the harvest type that fits the
 *    stand's development class (see priceCutTypeFor). Valuing a young stand at
 *    regeneration prices would overstate it badly.
 *  - Seedling stands (A0, T1, T2) have no merchantable volume: their value is 0
 *    here. Their expectation value (odotusarvo) is not included.
 *  - When the source gives no sawlog/pulpwood split, DEFAULT_SAWLOG_SHARE is
 *    used, and WASTE_SHARE of the volume is treated as unmerchantable
 *    (tops, defects).
 *  - Other deciduous trees (haapa, leppä, …) are valued as birch pulpwood at
 *    OTHER_DECIDUOUS_PRICE_FACTOR of its price, never as logs.
 *  - Land value is not included.
 */
import type {
  DevelopmentClass,
  ForestDataProvider,
  ForestStand,
  ForestValueResult,
  ForestValueWarning,
  PriceCutType,
  RecommendedOperation,
  StandStratum,
  StandValuation,
  StumpagePrices,
  TimberAssortment,
  TreeSpecies,
  ValueRange,
} from './types';
import { TREE_SPECIES } from './types';
import type { ClippedStand } from './clip';

// --- Tunable assumptions ---------------------------------------------------

/** Sawlog share of total volume when the source has no split, by species and development class. */
export const DEFAULT_SAWLOG_SHARE: Record<TreeSpecies, Partial<Record<DevelopmentClass, number>>> = {
  pine: { '02': 0.05, '03': 0.35, '04': 0.6, '05': 0.6, ER: 0.45, S0: 0.6, Y1: 0.5 },
  spruce: { '02': 0.05, '03': 0.4, '04': 0.62, '05': 0.6, ER: 0.45, S0: 0.55, Y1: 0.5 },
  birch: { '02': 0.0, '03': 0.25, '04': 0.35, '05': 0.35, ER: 0.25, S0: 0.3, Y1: 0.3 },
  other_deciduous: {},
};

/** Unmerchantable share when the split is estimated. */
export const WASTE_SHARE = 0.08;

export const OTHER_DECIDUOUS_PRICE_FACTOR = 0.8;

/** Development classes without merchantable timber. */
export const SEEDLING_CLASSES: DevelopmentClass[] = ['A0', 'T1', 'T2'];

/** Base half-width of the value range (±15 %). */
export const BASE_UNCERTAINTY = 0.15;
/** Added per year of data age beyond OUTDATED_AFTER_YEARS; forest grows and gets cut. */
export const UNCERTAINTY_PER_OUTDATED_YEAR = 0.01;
export const FALLBACK_PRICE_UNCERTAINTY = 0.05;
export const MANUAL_DATA_UNCERTAINTY = 0.3;
export const MAX_UNCERTAINTY = 0.4;

export const OUTDATED_AFTER_YEARS = 5;
/** Below this the estimate is not meaningful (one small stand, edge effects). */
export const SMALL_PARCEL_HA = 0.5;
/** Warn when forest data covers less than this share of the parcel. */
export const MIN_COVERAGE_SHARE = 0.8;
/** Forest land smaller than this counts as "no forest land". */
export const MIN_FOREST_LAND_HA = 0.05;

// ---------------------------------------------------------------------------

const ASSORTMENTS: TimberAssortment[] = [
  'pine_log',
  'spruce_log',
  'birch_log',
  'pine_pulp',
  'spruce_pulp',
  'birch_pulp',
];

function emptySpeciesRecord(): Record<TreeSpecies, number> {
  return { pine: 0, spruce: 0, birch: 0, other_deciduous: 0 };
}

function emptyAssortmentRecord(): Record<TimberAssortment, number> {
  return Object.fromEntries(ASSORTMENTS.map((a) => [a, 0])) as Record<TimberAssortment, number>;
}

export function priceCutTypeFor(stand: Pick<ForestStand, 'developmentClass' | 'meanAgeYears'>): PriceCutType {
  switch (stand.developmentClass) {
    case '04':
    case '05':
    case 'S0':
    case 'Y1':
      return 'regeneration';
    case '03':
    case 'ER':
      return 'thinning';
    case '02':
    case 'T1':
    case 'T2':
    case 'A0':
      return 'first_thinning';
    default:
      // Unknown class: guess from age
      if (stand.meanAgeYears !== null && stand.meanAgeYears >= 70) return 'regeneration';
      if (stand.meanAgeYears !== null && stand.meanAgeYears < 35) return 'first_thinning';
      return 'thinning';
  }
}

export interface StratumAssortments {
  species: TreeSpecies;
  sawlogM3PerHa: number;
  pulpwoodM3PerHa: number;
}

/** Sawlog and pulpwood per hectare for a stratum, estimating the split when missing. */
export function stratumAssortments(
  stratum: StandStratum,
  developmentClass: DevelopmentClass | null
): StratumAssortments {
  const { species, volumeM3PerHa } = stratum;
  if (developmentClass && SEEDLING_CLASSES.includes(developmentClass)) {
    return { species, sawlogM3PerHa: 0, pulpwoodM3PerHa: 0 };
  }
  if (stratum.sawlogM3PerHa !== null || stratum.pulpwoodM3PerHa !== null) {
    const sawlog = species === 'other_deciduous' ? 0 : stratum.sawlogM3PerHa ?? 0;
    // Other deciduous logs are sold as pulpwood
    const pulp = (stratum.pulpwoodM3PerHa ?? 0) + (species === 'other_deciduous' ? stratum.sawlogM3PerHa ?? 0 : 0);
    return { species, sawlogM3PerHa: sawlog, pulpwoodM3PerHa: pulp };
  }
  const share = developmentClass ? DEFAULT_SAWLOG_SHARE[species][developmentClass] ?? 0 : 0.3;
  const sawlog = volumeM3PerHa * share;
  const pulp = Math.max(0, volumeM3PerHa * (1 - WASTE_SHARE) - sawlog);
  return { species, sawlogM3PerHa: sawlog, pulpwoodM3PerHa: pulp };
}

function logAssortment(species: TreeSpecies): TimberAssortment | null {
  if (species === 'pine') return 'pine_log';
  if (species === 'spruce') return 'spruce_log';
  if (species === 'birch') return 'birch_log';
  return null;
}

function pulpAssortment(species: TreeSpecies): TimberAssortment {
  if (species === 'pine') return 'pine_pulp';
  if (species === 'spruce') return 'spruce_pulp';
  return 'birch_pulp';
}

/** Value of given volumes (m³) by assortment, with per-species and per-assortment breakdowns. */
export function priceVolumes(
  volumes: StratumAssortments[],
  cutType: PriceCutType,
  prices: StumpagePrices
): { totalEur: number; bySpecies: Record<TreeSpecies, number>; byAssortment: Record<TimberAssortment, number> } {
  const table = prices.prices[cutType];
  const bySpecies = emptySpeciesRecord();
  const byAssortment = emptyAssortmentRecord();
  let totalEur = 0;

  for (const v of volumes) {
    const logA = logAssortment(v.species);
    const pulpA = pulpAssortment(v.species);
    const factor = v.species === 'other_deciduous' ? OTHER_DECIDUOUS_PRICE_FACTOR : 1;
    const logEur = logA ? v.sawlogM3PerHa * table[logA] : 0;
    const pulpEur = v.pulpwoodM3PerHa * table[pulpA] * factor;
    if (logA) byAssortment[logA] += logEur;
    byAssortment[pulpA] += pulpEur;
    bySpecies[v.species] += logEur + pulpEur;
    totalEur += logEur + pulpEur;
  }

  return { totalEur, bySpecies, byAssortment };
}

function scaleAssortments(volumes: StratumAssortments[], factor: number): StratumAssortments[] {
  return volumes.map((v) => ({
    species: v.species,
    sawlogM3PerHa: v.sawlogM3PerHa * factor,
    pulpwoodM3PerHa: v.pulpwoodM3PerHa * factor,
  }));
}

/**
 * Sawlog share of the removal relative to the stand's sawlog share. Thinnings
 * remove mostly small and poor trees, so the removal has less sawlog than the
 * stand as a whole.
 */
export const REMOVAL_SAWLOG_FACTOR: Record<PriceCutType, number> = {
  first_thinning: 0.3,
  thinning: 0.7,
  regeneration: 1,
};

/**
 * Estimated harvest removal (m³) and stumpage income (€) when `removalShare`
 * of the stand's volume is cut from `areaHa`.
 */
export function estimateHarvest(
  stand: ForestStand,
  areaHa: number,
  removalShare: number,
  cutType: PriceCutType,
  prices: StumpagePrices
): { removalM3: number; incomeEur: number } {
  const sawlogFactor = REMOVAL_SAWLOG_FACTOR[cutType];
  const removed = stand.strata.map((s) => {
    const a = stratumAssortments(s, stand.developmentClass);
    const merchantable = a.sawlogM3PerHa + a.pulpwoodM3PerHa;
    const sawlog = a.sawlogM3PerHa * sawlogFactor;
    return {
      species: s.species,
      sawlogM3PerHa: sawlog * removalShare * areaHa,
      pulpwoodM3PerHa: (merchantable - sawlog) * removalShare * areaHa,
    };
  });
  const removalM3 = removed.reduce((sum, r) => sum + r.sawlogM3PerHa + r.pulpwoodM3PerHa, 0);
  const { totalEur } = priceVolumes(removed, cutType, prices);
  return { removalM3, incomeEur: totalEur };
}

export function standVolumeM3PerHa(stand: ForestStand): number {
  return stand.strata.reduce((sum, s) => sum + s.volumeM3PerHa, 0);
}

export function valueStand(
  clipped: ClippedStand,
  prices: StumpagePrices
): { valuation: StandValuation; bySpecies: Record<TreeSpecies, number>; byAssortment: Record<TimberAssortment, number> } {
  const { stand, areaHaInParcel } = clipped;
  const cutType = priceCutTypeFor(stand);
  const perHa = stand.strata.map((s) => stratumAssortments(s, stand.developmentClass));
  const priced = stand.isForestLand
    ? priceVolumes(scaleAssortments(perHa, areaHaInParcel), cutType, prices)
    : { totalEur: 0, bySpecies: emptySpeciesRecord(), byAssortment: emptyAssortmentRecord() };

  const volumeM3PerHa = standVolumeM3PerHa(stand);
  const speciesShares = emptySpeciesRecord();
  for (const s of stand.strata) {
    speciesShares[s.species] += volumeM3PerHa > 0 ? s.volumeM3PerHa / volumeM3PerHa : 0;
  }
  const sawlogPerHa = perHa.reduce((sum, a) => sum + a.sawlogM3PerHa, 0);
  const pulpPerHa = perHa.reduce((sum, a) => sum + a.pulpwoodM3PerHa, 0);

  return {
    valuation: {
      standId: stand.id,
      standNumber: stand.standNumber,
      geometry: clipped.geometry,
      areaHaInParcel,
      developmentClass: stand.developmentClass,
      mainSpecies: stand.mainSpecies ?? dominantSpecies(speciesShares),
      speciesShares,
      meanAgeYears: stand.meanAgeYears,
      volumeM3: volumeM3PerHa * areaHaInParcel,
      volumeM3PerHa,
      sawlogShare: volumeM3PerHa > 0 ? sawlogPerHa / volumeM3PerHa : 0,
      pulpwoodShare: volumeM3PerHa > 0 ? pulpPerHa / volumeM3PerHa : 0,
      valueEur: priced.totalEur,
      priceCutType: cutType,
      isForestLand: stand.isForestLand,
      inventoryYear: stand.inventoryYear,
    },
    bySpecies: priced.bySpecies,
    byAssortment: priced.byAssortment,
  };
}

function dominantSpecies(shares: Record<TreeSpecies, number>): TreeSpecies | null {
  let best: TreeSpecies | null = null;
  for (const species of TREE_SPECIES) {
    if (shares[species] > 0 && (best === null || shares[species] > shares[best])) best = species;
  }
  return best;
}

export function computeUncertainty(input: {
  provider: ForestDataProvider;
  dataAgeYears: number | null;
  priceSource: StumpagePrices['source'];
}): number {
  let u = input.provider === 'manual' ? MANUAL_DATA_UNCERTAINTY : BASE_UNCERTAINTY;
  if (input.dataAgeYears !== null && input.dataAgeYears > OUTDATED_AFTER_YEARS) {
    u += (input.dataAgeYears - OUTDATED_AFTER_YEARS) * UNCERTAINTY_PER_OUTDATED_YEAR;
  }
  if (input.priceSource === 'fallback') u += FALLBACK_PRICE_UNCERTAINTY;
  return Math.min(u, MAX_UNCERTAINTY);
}

/** Round to a sensible precision for display: ranges are estimates, not exact sums. */
export function roundEur(value: number): number {
  if (value >= 10_000) return Math.round(value / 500) * 500;
  if (value >= 1_000) return Math.round(value / 100) * 100;
  return Math.round(value / 10) * 10;
}

export function valueRange(midEur: number, uncertainty: number): ValueRange {
  return {
    lowEur: roundEur(midEur * (1 - uncertainty)),
    midEur: roundEur(midEur),
    highEur: roundEur(midEur * (1 + uncertainty)),
    uncertainty,
  };
}

export interface ComputeForestValueInput {
  propertyId: number;
  parcelAreaHa: number;
  stands: ClippedStand[];
  prices: StumpagePrices;
  provider: ForestDataProvider;
  operations: RecommendedOperation[];
  currentYear: number;
  now?: Date;
}

export function computeForestValue(input: ComputeForestValueInput): ForestValueResult {
  const { stands, prices, parcelAreaHa, currentYear } = input;
  const valueBySpecies = emptySpeciesRecord();
  const valueByAssortment = emptyAssortmentRecord();
  const valuations: StandValuation[] = [];

  for (const clipped of stands) {
    const { valuation, bySpecies, byAssortment } = valueStand(clipped, prices);
    valuations.push(valuation);
    for (const s of TREE_SPECIES) valueBySpecies[s] += bySpecies[s];
    for (const a of ASSORTMENTS) valueByAssortment[a] += byAssortment[a];
  }

  const coveredAreaHa = valuations.reduce((sum, v) => sum + v.areaHaInParcel, 0);
  const forestLandAreaHa = valuations
    .filter((v) => v.isForestLand)
    .reduce((sum, v) => sum + v.areaHaInParcel, 0);
  const totalVolumeM3 = valuations.reduce((sum, v) => sum + (v.isForestLand ? v.volumeM3 : 0), 0);
  const midEur = valuations.reduce((sum, v) => sum + v.valueEur, 0);

  const aged = valuations.filter((v) => v.isForestLand && v.meanAgeYears !== null);
  const agedArea = aged.reduce((sum, v) => sum + v.areaHaInParcel, 0);
  const meanAgeYears =
    agedArea > 0
      ? Math.round(aged.reduce((sum, v) => sum + (v.meanAgeYears as number) * v.areaHaInParcel, 0) / agedArea)
      : null;

  const years = valuations.map((v) => v.inventoryYear).filter((y): y is number => y !== null);
  const inventoryYearMin = years.length ? Math.min(...years) : null;
  const inventoryYearMax = years.length ? Math.max(...years) : null;
  const dataAgeYears = inventoryYearMin !== null ? currentYear - inventoryYearMin : null;
  const isOutdated = dataAgeYears !== null && dataAgeYears > OUTDATED_AFTER_YEARS;

  const uncertainty = computeUncertainty({ provider: input.provider, dataAgeYears, priceSource: prices.source });

  const warnings: ForestValueWarning[] = [];
  if (isOutdated) {
    warnings.push({
      code: 'outdated_data',
      message: `Metsävaratieto on vuodelta ${inventoryYearMin}, yli ${OUTDATED_AFTER_YEARS} vuotta vanhaa. Puusto on voinut kasvaa tai sitä on voitu hakata.`,
    });
  }
  if (parcelAreaHa < SMALL_PARCEL_HA) {
    warnings.push({
      code: 'small_parcel',
      message: `Palsta on pieni (${parcelAreaHa.toFixed(2)} ha), joten arvio on hyvin epätarkka.`,
    });
  }
  if (forestLandAreaHa < MIN_FOREST_LAND_HA && coveredAreaHa > 0) {
    warnings.push({
      code: 'no_forest_land',
      message: 'Palstalla ei metsävaratiedon mukaan ole metsämaata, joten puustolle ei lasketa arvoa.',
    });
  }
  if (input.provider !== 'manual' && parcelAreaHa > 0 && coveredAreaHa / parcelAreaHa < MIN_COVERAGE_SHARE) {
    warnings.push({
      code: 'partial_coverage',
      message: `Metsävaratieto kattaa vain ${Math.round((coveredAreaHa / parcelAreaHa) * 100)} % palstasta. Arvo koskee vain sitä osaa.`,
    });
  }
  if (prices.source === 'fallback') {
    warnings.push({
      code: 'fallback_prices',
      message: 'Luken ajantasaisia kantohintoja ei saatu, joten laskennassa käytetään varahintoja.',
    });
  }

  const priceInfo = { source: prices.source, region: prices.region, period: prices.period, fetchedAt: prices.fetchedAt };

  return {
    propertyId: input.propertyId,
    areaHa: parcelAreaHa,
    coveredAreaHa,
    forestLandAreaHa,
    totalVolumeM3,
    volumeM3PerHa: forestLandAreaHa > 0 ? totalVolumeM3 / forestLandAreaHa : 0,
    meanAgeYears,
    value: valueRange(midEur, uncertainty),
    valueBySpecies,
    valueByAssortment,
    stands: valuations,
    operations: input.operations,
    data: { provider: input.provider, inventoryYearMin, inventoryYearMax, isOutdated },
    prices: priceInfo,
    warnings,
    computedAt: (input.now ?? new Date()).toISOString(),
  };
}
