/**
 * A stand built from owner-entered basics when Metsäkeskus has no data for the
 * parcel. The whole parcel is treated as one stand of one species, so the
 * result is rough (see MANUAL_DATA_UNCERTAINTY in valuation.ts).
 */
import { THRESHOLDS } from './recommendationRules';
import type { DevelopmentClass, ForestStand, ManualStandInput, PolygonGeometry, TreeSpecies } from './types';
import { TREE_SPECIES } from './types';

export const MANUAL_LIMITS = {
  ageYears: { min: 0, max: 250 },
  volumeM3PerHa: { min: 0, max: 600 },
};

/** Validate request input; returns an error message (Finnish) or null. */
export function validateManualInput(input: unknown): { value: ManualStandInput } | { error: string } {
  const body = (input ?? {}) as Record<string, unknown>;
  const species = body.species as TreeSpecies;
  const ageYears = Number(body.ageYears);
  const volumeM3PerHa = Number(body.volumeM3PerHa);
  if (!TREE_SPECIES.includes(species)) return { error: 'Valitse pääpuulaji' };
  if (!Number.isFinite(ageYears) || ageYears < MANUAL_LIMITS.ageYears.min || ageYears > MANUAL_LIMITS.ageYears.max) {
    return { error: `Iän pitää olla ${MANUAL_LIMITS.ageYears.min}–${MANUAL_LIMITS.ageYears.max} vuotta` };
  }
  if (
    !Number.isFinite(volumeM3PerHa) ||
    volumeM3PerHa < MANUAL_LIMITS.volumeM3PerHa.min ||
    volumeM3PerHa > MANUAL_LIMITS.volumeM3PerHa.max
  ) {
    return { error: `Puuston määrän pitää olla ${MANUAL_LIMITS.volumeM3PerHa.min}–${MANUAL_LIMITS.volumeM3PerHa.max} m³/ha` };
  }
  return { value: { species, ageYears: Math.round(ageYears), volumeM3PerHa } };
}

/** Development class guessed from age and volume. */
export function developmentClassFor(input: ManualStandInput): DevelopmentClass {
  const { ageYears, volumeM3PerHa, species } = input;
  if (ageYears < 5 && volumeM3PerHa < 5) return 'T1';
  if (ageYears < 20 && volumeM3PerHa < 40) return 'T2';
  if (ageYears < 35) return '02';
  if (ageYears < THRESHOLDS.regenerationAge[species]) return '03';
  return '04';
}

export function manualStand(parcel: PolygonGeometry, areaHa: number, input: ManualStandInput, currentYear: number): ForestStand {
  return {
    id: 'manual',
    standNumber: '1',
    geometry: parcel,
    areaHa,
    developmentClass: developmentClassFor(input),
    mainSpecies: input.species,
    meanAgeYears: input.ageYears,
    stemsPerHa: null,
    basalAreaM2PerHa: null,
    fertilityClass: null,
    soilType: null,
    isForestLand: true,
    strata: [
      {
        species: input.species,
        volumeM3PerHa: input.volumeM3PerHa,
        // Split estimated from DEFAULT_SAWLOG_SHARE in valuation.ts
        sawlogM3PerHa: null,
        pulpwoodM3PerHa: null,
        meanAgeYears: input.ageYears,
        stemsPerHa: null,
        basalAreaM2PerHa: null,
        meanHeightM: null,
        meanDiameterCm: null,
      },
    ],
    inventoryYear: currentYear,
    proposedOperations: [],
  };
}
