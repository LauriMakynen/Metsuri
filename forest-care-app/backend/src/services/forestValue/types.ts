/**
 * Domain model for the "Metsäpalstan arvo" (forest parcel value) feature.
 *
 * Stand (kuvio) data follows the structure of Suomen metsäkeskus open forest
 * resource data (metsävaratieto): a stand has general attributes and one or
 * more tree strata (puustojaksot) per species. External field codes are mapped
 * to these types in metsakeskusClient.ts, so the rest of the code never sees
 * raw API codes.
 *
 * All geometries in this module are in ETRS-TM35FIN (EPSG:3067), a metric
 * projected system, so areas can be computed in the plane.
 */

export type TreeSpecies = 'pine' | 'spruce' | 'birch' | 'other_deciduous';

export const TREE_SPECIES: TreeSpecies[] = ['pine', 'spruce', 'birch', 'other_deciduous'];

/**
 * Development class (kehitysluokka), codes as in the Finnish forest data standard:
 *   A0 aukea uudistusala, S0 siemenpuumetsikkö,
 *   T1 taimikko alle 1,3 m, T2 taimikko yli 1,3 m, Y1 ylispuustoinen taimikko,
 *   02 nuori kasvatusmetsikkö, 03 varttunut kasvatusmetsikkö,
 *   04 uudistuskypsä metsikkö, 05 suojuspuumetsikkö, ER eri-ikäisrakenteinen metsikkö
 * (koodistot.suomi.fi, registry metsarek, scheme kehitysluokka-v_1_0)
 */
export type DevelopmentClass = 'A0' | 'S0' | 'T1' | 'T2' | 'Y1' | '02' | '03' | '04' | '05' | 'ER';

export const DEVELOPMENT_CLASSES: DevelopmentClass[] = ['A0', 'S0', 'T1', 'T2', 'Y1', '02', '03', '04', '05', 'ER'];

/** Timber assortments (puutavaralajit) that have a stumpage price. */
export type TimberAssortment =
  | 'pine_log'
  | 'spruce_log'
  | 'birch_log'
  | 'pine_pulp'
  | 'spruce_pulp'
  | 'birch_pulp';

/**
 * Harvest type the stumpage price applies to. Luke publishes stumpage prices
 * separately for these, and the price level differs clearly between them.
 */
export type PriceCutType = 'regeneration' | 'thinning' | 'first_thinning';

export type StumpagePriceTable = Record<PriceCutType, Record<TimberAssortment, number>>;

export interface StumpagePrices {
  source: 'luke' | 'fallback';
  /** Region the prices are for, e.g. a Metsäkeskus region name, or 'Koko maa'. */
  region: string;
  /** Statistics period, e.g. '2026M09' or '2026-08'. */
  period: string | null;
  fetchedAt: string;
  /** €/m³, stumpage (kantohinta) */
  prices: StumpagePriceTable;
}

/** Polygon geometry. EPSG:3067 inside the backend, EPSG:4326 in API responses. */
export type PolygonGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] };

/** One tree stratum (puustojakso) of a stand, values per hectare. */
export interface StandStratum {
  species: TreeSpecies;
  volumeM3PerHa: number;
  /** Null when the source does not give the split; a default share is used then. */
  sawlogM3PerHa: number | null;
  pulpwoodM3PerHa: number | null;
  meanAgeYears: number | null;
  stemsPerHa: number | null;
  basalAreaM2PerHa: number | null;
  meanHeightM: number | null;
  meanDiameterCm: number | null;
}

export type OperationType =
  | 'young_stand_management' // taimikonhoito
  | 'brush_clearing' // vesakonhoito / varhaishoito
  | 'first_thinning' // ensiharvennus
  | 'thinning' // harvennushakkuu
  | 'clear_cut' // uudistushakkuu, avohakkuu
  | 'selection_cut' // poimintahakkuu (eri-ikäisrakenteinen)
  | 'seed_tree_cut' // siemenpuuhakkuu
  | 'overstory_removal' // ylispuiden poisto
  | 'soil_preparation' // maanmuokkaus
  | 'planting'; // istutus / kylvö

/** An operation proposal that comes with the source data (Metsäkeskus toimenpide-ehdotus). */
export interface ProposedOperation {
  type: OperationType;
  /** Proposed year, if given by the source. */
  year: number | null;
}

export interface ForestStand {
  /** Source identifier (Metsäkeskus stand id, or a mock/manual id). */
  id: string;
  /** Stand number shown to the owner (kuvionumero). */
  standNumber: string | null;
  geometry: PolygonGeometry;
  /** Area of the whole stand, also the part outside the parcel. */
  areaHa: number;
  developmentClass: DevelopmentClass | null;
  mainSpecies: TreeSpecies | null;
  meanAgeYears: number | null;
  stemsPerHa: number | null;
  basalAreaM2PerHa: number | null;
  /** Site fertility class 1 (lehto) … 8 (lakimetsä/kalliomaa), kasvupaikkatyyppi. */
  fertilityClass: number | null;
  soilType: 'mineral' | 'peatland' | null;
  /** False for kitumaa, joutomaa and non-forest land. */
  isForestLand: boolean;
  strata: StandStratum[];
  inventoryYear: number | null;
  proposedOperations: ProposedOperation[];
}

export type ForestDataProvider = 'metsakeskus' | 'mock' | 'manual';

/** Owner-entered basics when no forest resource data is available. */
export interface ManualStandInput {
  species: TreeSpecies;
  ageYears: number;
  volumeM3PerHa: number;
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface ValueRange {
  lowEur: number;
  midEur: number;
  highEur: number;
  /** Half-width of the range relative to midEur, e.g. 0.15 for ±15 %. */
  uncertainty: number;
}

export interface StandValuation {
  standId: string;
  standNumber: string | null;
  /** Stand geometry clipped to the parcel, for highlighting on the map. */
  geometry: PolygonGeometry | null;
  areaHaInParcel: number;
  developmentClass: DevelopmentClass | null;
  mainSpecies: TreeSpecies | null;
  /** Share of volume by species, 0–1. */
  speciesShares: Record<TreeSpecies, number>;
  meanAgeYears: number | null;
  volumeM3: number;
  volumeM3PerHa: number;
  /** Share of volume that is sawlog / pulpwood, 0–1. */
  sawlogShare: number;
  pulpwoodShare: number;
  valueEur: number;
  priceCutType: PriceCutType;
  isForestLand: boolean;
  inventoryYear: number | null;
}

export type OperationTiming = 'now' | '1-3y' | '3-5y' | '5-10y' | '10y+';

export interface RecommendedOperation {
  standId: string;
  standNumber: string | null;
  type: OperationType;
  timing: OperationTiming;
  /** Suggested year: the source's proposal year, or a representative year of the timing class. */
  year: number;
  /** Plain-language reason for the owner (Finnish). */
  reason: string;
  source: 'metsakeskus' | 'rules';
  estimatedRemovalM3: number | null;
  estimatedIncomeEur: number | null;
}

export type ForestValueWarningCode =
  | 'outdated_data' // inventory older than 5 years
  | 'small_parcel' // parcel too small for a meaningful estimate
  | 'no_forest_land' // parcel is not forest land
  | 'partial_coverage' // stands cover only part of the parcel
  | 'fallback_prices' // Luke prices unavailable, config prices used
  | 'stale_cache'; // external API failed, showing the last cached result

export interface ForestValueWarning {
  code: ForestValueWarningCode;
  message: string;
}

export interface ForestValueResult {
  propertyId: number;
  areaHa: number;
  /** Parcel area covered by stands (forest data). */
  coveredAreaHa: number;
  forestLandAreaHa: number;
  totalVolumeM3: number;
  volumeM3PerHa: number;
  /** Area-weighted over stands that have an age. */
  meanAgeYears: number | null;
  value: ValueRange;
  valueBySpecies: Record<TreeSpecies, number>;
  valueByAssortment: Record<TimberAssortment, number>;
  stands: StandValuation[];
  operations: RecommendedOperation[];
  data: {
    provider: ForestDataProvider;
    /** Oldest and newest inventory year among the stands. */
    inventoryYearMin: number | null;
    inventoryYearMax: number | null;
    isOutdated: boolean;
  };
  prices: Omit<StumpagePrices, 'prices'>;
  warnings: ForestValueWarning[];
  computedAt: string;
}

export type ForestValueResponse =
  | { status: 'available'; result: ForestValueResult; stale: boolean }
  | { status: 'no_data'; message: string }
  | { status: 'error'; message: string };
