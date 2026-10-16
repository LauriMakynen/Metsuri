/**
 * Mock forest stand data for development (FOREST_DATA_MODE=mock) and the guest demo.
 *
 * Instead of fixed coordinates, the parcel's bounding box is split into a grid
 * of rectangular stands, so mock data works for any parcel the developer draws.
 * The stands extend past the parcel edges on purpose: clipping to the parcel is
 * part of what the real pipeline must do. Values are typical southern Finland
 * figures, not measurements.
 */
import type { ForestStand, PolygonGeometry, StandStratum, TreeSpecies } from './types';

type StandTemplate = Omit<ForestStand, 'id' | 'standNumber' | 'geometry' | 'areaHa'>;

function stratum(
  species: TreeSpecies,
  volumeM3PerHa: number,
  sawlogM3PerHa: number | null,
  pulpwoodM3PerHa: number | null,
  meanAgeYears: number,
  extra: Partial<StandStratum> = {}
): StandStratum {
  return {
    species,
    volumeM3PerHa,
    sawlogM3PerHa,
    pulpwoodM3PerHa,
    meanAgeYears,
    stemsPerHa: null,
    basalAreaM2PerHa: null,
    meanHeightM: null,
    meanDiameterCm: null,
    ...extra,
  };
}

// Six typical stand types; one with old inventory data to exercise the "outdated" warning.
export const MOCK_STAND_TEMPLATES: StandTemplate[] = [
  {
    developmentClass: '04',
    mainSpecies: 'spruce',
    meanAgeYears: 85,
    stemsPerHa: 620,
    basalAreaM2PerHa: 30,
    fertilityClass: 3,
    soilType: 'mineral',
    isForestLand: true,
    strata: [
      stratum('spruce', 230, 150, 70, 85, { meanHeightM: 24, meanDiameterCm: 28 }),
      stratum('pine', 20, 13, 6, 90),
      stratum('birch', 15, 5, 9, 80),
    ],
    inventoryYear: 2021,
    proposedOperations: [{ type: 'clear_cut', year: 2027 }],
  },
  {
    developmentClass: '03',
    mainSpecies: 'pine',
    meanAgeYears: 55,
    stemsPerHa: 900,
    basalAreaM2PerHa: 24,
    fertilityClass: 4,
    soilType: 'mineral',
    isForestLand: true,
    strata: [
      stratum('pine', 150, 70, 75, 55, { meanHeightM: 18, meanDiameterCm: 20 }),
      stratum('spruce', 15, 3, 11, 45),
      stratum('birch', 10, 1, 8, 50),
    ],
    inventoryYear: 2021,
    proposedOperations: [{ type: 'thinning', year: 2026 }],
  },
  {
    developmentClass: '02',
    mainSpecies: 'spruce',
    meanAgeYears: 30,
    stemsPerHa: 1800,
    basalAreaM2PerHa: 16,
    fertilityClass: 3,
    soilType: 'mineral',
    isForestLand: true,
    strata: [
      stratum('spruce', 70, 5, 60, 30, { meanHeightM: 11, meanDiameterCm: 12 }),
      stratum('birch', 30, 0, 28, 28),
    ],
    inventoryYear: 2021,
    // No proposal: the rule engine has to suggest the first thinning.
    proposedOperations: [],
  },
  {
    developmentClass: 'T2',
    mainSpecies: 'spruce',
    meanAgeYears: 12,
    stemsPerHa: 3500,
    basalAreaM2PerHa: null,
    fertilityClass: 3,
    soilType: 'mineral',
    isForestLand: true,
    strata: [
      stratum('spruce', 15, null, null, 12, { meanHeightM: 3.5 }),
      stratum('birch', 5, null, null, 10, { meanHeightM: 4 }),
    ],
    inventoryYear: 2021,
    proposedOperations: [],
  },
  {
    developmentClass: '03',
    mainSpecies: 'birch',
    meanAgeYears: 45,
    stemsPerHa: 1000,
    basalAreaM2PerHa: 20,
    fertilityClass: 2,
    soilType: 'mineral',
    isForestLand: true,
    strata: [
      stratum('birch', 90, 25, 60, 45, { meanHeightM: 19, meanDiameterCm: 19 }),
      stratum('spruce', 50, 20, 28, 40),
      stratum('other_deciduous', 10, null, 8, 40),
    ],
    inventoryYear: 2021,
    proposedOperations: [],
  },
  {
    developmentClass: '04',
    mainSpecies: 'pine',
    meanAgeYears: 95,
    stemsPerHa: 450,
    basalAreaM2PerHa: 22,
    fertilityClass: 4,
    soilType: 'mineral',
    isForestLand: true,
    strata: [
      stratum('pine', 210, 140, 60, 95, { meanHeightM: 23, meanDiameterCm: 29 }),
      stratum('spruce', 10, 4, 5, 70),
    ],
    inventoryYear: 2019,
    proposedOperations: [],
  },
];

function boundingBox(geometry: PolygonGeometry): [number, number, number, number] {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Generate mock stands covering a parcel.
 *
 * @param parcel - Parcel geometry in EPSG:3067 (metres)
 * @param seed - Varies which template lands where, e.g. the property id
 */
export function generateMockStands(parcel: PolygonGeometry, seed = 0): ForestStand[] {
  const [minX, minY, maxX, maxY] = boundingBox(parcel);
  const width = maxX - minX;
  const height = maxY - minY;
  // Aim for stands of roughly 150–250 m per side, at most a 3 × 3 grid
  const cols = Math.min(3, Math.max(1, Math.round(width / 200)));
  const rows = Math.min(3, Math.max(1, Math.round(height / 200)));
  // Extend the grid a little past the parcel so stands need clipping
  const margin = 20;
  const cellW = (width + 2 * margin) / cols;
  const cellH = (height + 2 * margin) / rows;

  const stands: ForestStand[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const index = row * cols + col;
      const template = MOCK_STAND_TEMPLATES[(index + Math.abs(seed)) % MOCK_STAND_TEMPLATES.length];
      const x0 = minX - margin + col * cellW;
      const y0 = minY - margin + row * cellH;
      stands.push({
        ...template,
        strata: template.strata.map((s) => ({ ...s })),
        proposedOperations: template.proposedOperations.map((p) => ({ ...p })),
        id: `mock-${seed}-${index + 1}`,
        standNumber: `${index + 1}`,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [x0, y0],
            [x0 + cellW, y0],
            [x0 + cellW, y0 + cellH],
            [x0, y0 + cellH],
            [x0, y0],
          ]],
        },
        areaHa: (cellW * cellH) / 10_000,
      });
    }
  }
  return stands;
}
