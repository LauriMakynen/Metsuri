/**
 * Recommended forest operations per stand.
 *
 * Operation proposals included in the Metsäkeskus data take precedence; the
 * rules in recommendationRules.ts are used only for stands without them.
 */
import type { ClippedStand } from './clip';
import {
  PRICE_CUT_TYPE,
  REMOVAL_SHARE,
  RULES,
  SOURCE_PROPOSAL_REASON,
  type FollowUp,
  type RecommendationRule,
  type StandContext,
} from './recommendationRules';
import type { ForestStand, OperationTiming, OperationType, RecommendedOperation, StumpagePrices, TreeSpecies } from './types';
import { TREE_SPECIES } from './types';
import { estimateHarvest, standVolumeM3PerHa } from './valuation';

/** Stands smaller than this inside the parcel get no recommendations of their own. */
export const MIN_STAND_AREA_FOR_OPERATIONS_HA = 0.05;

/**
 * Representative year offset for each timing class. Must map back to the same
 * class through timingFromYears.
 */
export const TIMING_OFFSET_YEARS: Record<OperationTiming, number> = {
  now: 0,
  '1-3y': 2,
  '3-5y': 4,
  '5-10y': 7,
  '10y+': 12,
};

export function timingFromYears(yearsFromNow: number): OperationTiming {
  if (yearsFromNow <= 0) return 'now';
  if (yearsFromNow <= 3) return '1-3y';
  if (yearsFromNow <= 5) return '3-5y';
  if (yearsFromNow <= 10) return '5-10y';
  return '10y+';
}

function dominantSpecies(stand: ForestStand): TreeSpecies {
  if (stand.mainSpecies) return stand.mainSpecies;
  const volumes: Record<TreeSpecies, number> = { pine: 0, spruce: 0, birch: 0, other_deciduous: 0 };
  for (const s of stand.strata) volumes[s.species] += s.volumeM3PerHa;
  return TREE_SPECIES.reduce((best, s) => (volumes[s] > volumes[best] ? s : best), 'pine' as TreeSpecies);
}

export function standContext(stand: ForestStand): StandContext {
  const species = dominantSpecies(stand);
  const main = stand.strata.find((s) => s.species === species) ?? null;
  return {
    developmentClass: stand.developmentClass,
    species,
    ageYears: stand.meanAgeYears ?? main?.meanAgeYears ?? null,
    stemsPerHa: stand.stemsPerHa,
    basalAreaM2PerHa: stand.basalAreaM2PerHa,
    meanHeightM: main?.meanHeightM ?? null,
    volumeM3PerHa: standVolumeM3PerHa(stand),
    fertilityClass: stand.fertilityClass,
  };
}

export function matchRule(ctx: StandContext, rules: RecommendationRule[] = RULES): RecommendationRule | null {
  return rules.find((rule) => rule.when(ctx)) ?? null;
}

function buildOperation(
  clipped: ClippedStand,
  type: OperationType,
  year: number,
  currentYear: number,
  reason: string,
  source: RecommendedOperation['source'],
  prices: StumpagePrices
): RecommendedOperation {
  const removalShare = REMOVAL_SHARE[type];
  const cutType = PRICE_CUT_TYPE[type];
  const harvest =
    removalShare !== undefined && cutType !== undefined
      ? estimateHarvest(clipped.stand, clipped.areaHaInParcel, removalShare, cutType, prices)
      : null;
  return {
    standId: clipped.stand.id,
    standNumber: clipped.stand.standNumber,
    type,
    timing: timingFromYears(year - currentYear),
    year,
    reason,
    source,
    estimatedRemovalM3: harvest && harvest.removalM3 > 0 ? Math.round(harvest.removalM3) : null,
    estimatedIncomeEur: harvest && harvest.incomeEur > 0 ? Math.round(harvest.incomeEur / 10) * 10 : null,
  };
}

function followUpOperations(
  clipped: ClippedStand,
  followUps: FollowUp[] | undefined,
  mainYear: number,
  currentYear: number,
  source: RecommendedOperation['source'],
  prices: StumpagePrices,
  skip: Set<OperationType> = new Set()
): RecommendedOperation[] {
  return (followUps ?? [])
    .filter((f) => !skip.has(f.operation))
    .map((f) => buildOperation(clipped, f.operation, mainYear + f.delayYears, currentYear, f.reason, source, prices));
}

export function recommendOperationsForStand(
  clipped: ClippedStand,
  prices: StumpagePrices,
  currentYear: number,
  rules: RecommendationRule[] = RULES
): RecommendedOperation[] {
  const { stand } = clipped;
  if (!stand.isForestLand || clipped.areaHaInParcel < MIN_STAND_AREA_FOR_OPERATIONS_HA) return [];

  const ctx = standContext(stand);

  if (stand.proposedOperations.length > 0) {
    const proposedTypes = new Set(stand.proposedOperations.map((p) => p.type));
    return stand.proposedOperations.flatMap((proposal) => {
      // Proposals dated in the past are still pending: show them as due now
      const year = Math.max(proposal.year ?? currentYear, currentYear);
      const rule = rules.find((r) => r.operation === proposal.type && r.when(ctx));
      const reason = rule ? `${SOURCE_PROPOSAL_REASON} ${rule.reason(ctx)}` : SOURCE_PROPOSAL_REASON;
      return [
        buildOperation(clipped, proposal.type, year, currentYear, reason, 'metsakeskus', prices),
        // Derived follow-ups (e.g. planting after a clear cut) unless the source already proposes them
        ...followUpOperations(clipped, rule?.followUps, year, currentYear, 'rules', prices, proposedTypes),
      ];
    });
  }

  const rule = matchRule(ctx, rules);
  if (!rule) return [];
  const year = currentYear + TIMING_OFFSET_YEARS[rule.timing(ctx)];
  return [
    buildOperation(clipped, rule.operation, year, currentYear, rule.reason(ctx), 'rules', prices),
    ...followUpOperations(clipped, rule.followUps, year, currentYear, 'rules', prices),
  ];
}

export function recommendOperations(
  stands: ClippedStand[],
  prices: StumpagePrices,
  currentYear: number,
  rules: RecommendationRule[] = RULES
): RecommendedOperation[] {
  return stands
    .flatMap((s) => recommendOperationsForStand(s, prices, currentYear, rules))
    .sort(
      (a, b) =>
        a.year - b.year ||
        (a.standNumber ?? '').localeCompare(b.standNumber ?? '', 'fi', { numeric: true })
    );
}
