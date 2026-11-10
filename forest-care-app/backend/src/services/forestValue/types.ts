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
  /** For the return history. Missing in results cached before the history existed. */
  valueByAssortment?: Record<TimberAssortment, number>;
  fertilityClass?: number | null;
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
  | 'stale_cache' // external API failed, showing the last cached result
  | 'field_area' // part of the parcel is field, left out of the valuation
  | 'fields_unavailable'; // the field parcel register could not be checked

export interface ForestValueWarning {
  code: ForestValueWarningCode;
  message: string;
}

/** Field (pelto) on the parcel: no timber value, no forest management recommendations. */
export interface FieldArea {
  /** register = Ruokavirasto's field parcel register, owner = the owner marked a stand as field */
  source: 'register' | 'owner';
  /** Peruslohkotunnus for register fields */
  fieldId: string | null;
  /** The stand the owner marked, so the mark can be undone */
  standId: string | null;
  standNumber: string | null;
  /** Part of the parcel; EPSG:3067 in the backend, WGS84 in API responses. */
  geometry: PolygonGeometry;
  areaHa: number;
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
  /** Fields left out of the valuation. Missing in results cached before fields were checked. */
  fields?: FieldArea[];
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

// ---------------------------------------------------------------------------
// Return history ("tuottohistoria")
// ---------------------------------------------------------------------------

/** good = short period on known stands, rough = long period or gaps in the data */
export type HistoryAccuracy = 'good' | 'rough' | 'unavailable';

/** Estimated change of the standing timber over the last `years` years. */
export interface HistoryPeriod {
  years: number;
  fromYear: number;
  accuracy: HistoryAccuracy;
  /** Why the period is rough or unavailable (Finnish), null when good */
  note: string | null;
  volumeThenM3: number;
  volumeNowM3: number;
  valueThenEur: number;
  valueNowEur: number;
  changeEur: number;
  /** Null when there was no value at the start of the period */
  changePct: number | null;
  /** Compound annual growth rate, % */
  annualPct: number | null;
  /** changeEur split in two: more wood, and a different price for it */
  growthEffectEur: number;
  priceEffectEur: number;
}

export interface HistoryPoint {
  year: number;
  volumeM3: number;
  valueEur: number;
}

export interface ForestValueHistory {
  propertyId: number;
  periods: HistoryPeriod[];
  /** Estimated value per year, oldest first, ending in the current year */
  series: HistoryPoint[];
  /** Values the app has actually stored (one per month), oldest first */
  recorded: { date: string; volumeM3: number; valueEur: number }[];
  provider: ForestDataProvider;
  priceSource: 'luke' | 'bundled';
  /** Price statistics years the price change is measured between */
  priceYears: { from: number; to: number };
  computedAt: string;
}

export type ForestValueHistoryResponse =
  | { status: 'available'; history: ForestValueHistory }
  | { status: 'no_data'; message: string }
  | { status: 'error'; message: string };

export type ForestValueResponse =
  | { status: 'available'; result: ForestValueResult; stale: boolean }
  | { status: 'no_data'; message: string }
  | { status: 'error'; message: string };
