import type { ClippedStand } from '../clip';
import type { ForestStand, PolygonGeometry, StandStratum, StumpagePrices } from '../types';

export const PRICES: StumpagePrices = {
  source: 'luke',
  region: 'Testialue',
  period: '2026M09',
  fetchedAt: '2026-10-01T00:00:00.000Z',
  prices: {
    regeneration: { pine_log: 76, spruce_log: 78, birch_log: 52, pine_pulp: 27, spruce_pulp: 28, birch_pulp: 26 },
    thinning: { pine_log: 62, spruce_log: 63, birch_log: 45, pine_pulp: 22, spruce_pulp: 22, birch_pulp: 21 },
    first_thinning: { pine_log: 50, spruce_log: 50, birch_log: 38, pine_pulp: 17, spruce_pulp: 17, birch_pulp: 16 },
  },
};

/** Axis-aligned rectangle in EPSG:3067-like metres. */
export function rect(x0: number, y0: number, width: number, height: number): PolygonGeometry {
  return {
    type: 'Polygon',
    coordinates: [[
      [x0, y0],
      [x0 + width, y0],
      [x0 + width, y0 + height],
      [x0, y0 + height],
      [x0, y0],
    ]],
  };
}

export function stratum(overrides: Partial<StandStratum> = {}): StandStratum {
  return {
    species: 'spruce',
    volumeM3PerHa: 150,
    sawlogM3PerHa: 100,
    pulpwoodM3PerHa: 50,
    meanAgeYears: 80,
    stemsPerHa: null,
    basalAreaM2PerHa: null,
    meanHeightM: null,
    meanDiameterCm: null,
    ...overrides,
  };
}

export function stand(overrides: Partial<ForestStand> = {}): ForestStand {
  return {
    id: 's1',
    standNumber: '1',
    geometry: rect(0, 0, 100, 100),
    areaHa: 1,
    developmentClass: '04',
    mainSpecies: 'spruce',
    meanAgeYears: 80,
    stemsPerHa: null,
    basalAreaM2PerHa: null,
    fertilityClass: 3,
    soilType: 'mineral',
    isForestLand: true,
    strata: [stratum()],
    inventoryYear: 2024,
    proposedOperations: [],
    ...overrides,
  };
}

export function clipped(s: ForestStand, areaHaInParcel = 1): ClippedStand {
  return { stand: s, geometry: s.geometry, areaHaInParcel };
}
