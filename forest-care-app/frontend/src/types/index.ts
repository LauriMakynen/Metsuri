// Type definitions for the application

export interface User {
  id: number;
  email: string;
}

export interface AuthState {
  token: string | null;
  user: User | null;
}

// GeoJSON geometry types
export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] }
  | { type: 'MultiPolygon'; coordinates: [number, number][][][] }
  | null;

// Marking types for forest management activities
export type MarkingType = 'vesakonhoito' | 'istutus' | 'harvennus' | 'avohakkuu' | 'muu_tyo';

// Geometry types for map elements
export type GeometryType = 'point' | 'line' | 'area' | 'note';

export interface Property {
  id: number;
  name: string;
  property_code?: string | null;
  source?: string;
  area_ha?: number | null;
  geometry: GeoJSONGeometry;
  created_at: string;
  updated_at?: string;
}

export interface Marking {
  id: number;
  user_id?: number;
  property_id: number | null;
  type: MarkingType;
  geometry_type: GeometryType;
  title: string;
  description: string | null;
  geometry: GeoJSONGeometry;
  area_ha?: number | null;
  operation_date?: string | null;
  follow_up_date_start?: string | null;
  follow_up_date_end?: string | null;
  follow_up_note?: string | null;
  created_at: string;
  updated_at: string;
}

// owner_receives = timber sale, highest offer is best; owner_pays = service, lowest is best
export type Pricing = 'owner_receives' | 'owner_pays';

// Anonymous bid summary shared by the owner and public views
export interface BidSummary {
  pricing: Pricing;
  bid_count: number;
  best_bid_eur: number | null;
  latest_bid_at: string | null;
}

// Photo attached to a work request; taken_at is null when the device gave no capture time
export interface WorkRequestPhoto {
  id: number;
  taken_at: string | null;
}

// Planned work the owner asks offers for (markings, in contrast, record done work)
interface WorkRequestBase extends BidSummary {
  id: number;
  type: MarkingType;
  title: string;
  geometry_type: GeometryType;
  geometry: GeoJSONGeometry;
  area_ha: number | null;
  note: string | null;
  // Service: what the owner is willing to pay. Timber sale: the owner's asking price.
  target_price_eur: number | null;
  created_at: string;
  photos: WorkRequestPhoto[];
}

// A forest owner's own work request
export interface WorkRequest extends WorkRequestBase {
  property_id: number | null;
  status: 'open' | 'closed';
  updated_at: string;
}

export interface NewWorkRequest {
  property_id: number;
  type: MarkingType;
  title: string;
  geometry: GeoJSONGeometry;
  note: string;
  pricing: Pricing;
  target_price_eur: number;
}

// Open work request as shown publicly to work providers (no owner or bidder details)
export interface PublicWorkRequest extends WorkRequestBase {
  lat: number;
  lng: number;
  // Only meaningful for a logged-in viewer
  is_own: boolean;
  my_bid_eur: number | null;
  // Region (maakunta) the request lies in; null if it could not be determined
  region_code: string | null;
  region_name: string | null;
}

// Finnish region (maakunta) for filtering work requests
export interface Region {
  code: string;
  name: string;
}

export interface CadastreFeatureProperties {
  propertyCode: string;
  name: string;
  areaHa?: number;
  // Number of separate parcels (palstat) the property consists of
  parcelCount?: number;
  source: 'mml' | 'mock';
}

export interface CadastreFeature {
  type: 'Feature';
  geometry: GeoJSONGeometry;
  properties: CadastreFeatureProperties;
}

export interface MapLayerConfig {
  provider: 'mml-proxy' | 'fallback';
  layers: {
    maastokartta: string;
    peruskartta: string;
    ortokuva: string;
  };
  overlays?: {
    kiinteistorajat?: string;
  };
  attribution: string;
}

// ---------------------------------------------------------------------------
// Forest parcel value ("Metsäpalstan arvo"). Mirrors backend/src/services/forestValue/types.ts.
// ---------------------------------------------------------------------------

export type TreeSpecies = 'pine' | 'spruce' | 'birch' | 'other_deciduous';

// Kehitysluokka codes of the Finnish forest data standard
export type DevelopmentClass = 'A0' | 'S0' | 'T1' | 'T2' | 'Y1' | '02' | '03' | '04' | '05' | 'ER';

export type TimberAssortment =
  | 'pine_log'
  | 'spruce_log'
  | 'birch_log'
  | 'pine_pulp'
  | 'spruce_pulp'
  | 'birch_pulp';

export type PriceCutType = 'regeneration' | 'thinning' | 'first_thinning';

export type OperationType =
  | 'young_stand_management'
  | 'brush_clearing'
  | 'first_thinning'
  | 'thinning'
  | 'clear_cut'
  | 'selection_cut'
  | 'seed_tree_cut'
  | 'overstory_removal'
  | 'soil_preparation'
  | 'planting';

export type OperationTiming = 'now' | '1-3y' | '3-5y' | '5-10y' | '10y+';

export interface ValueRange {
  lowEur: number;
  midEur: number;
  highEur: number;
  uncertainty: number;
}

export interface StandValuation {
  standId: string;
  standNumber: string | null;
  // Stand clipped to the parcel, WGS84
  geometry: GeoJSONGeometry;
  areaHaInParcel: number;
  developmentClass: DevelopmentClass | null;
  mainSpecies: TreeSpecies | null;
  speciesShares: Record<TreeSpecies, number>;
  meanAgeYears: number | null;
  volumeM3: number;
  volumeM3PerHa: number;
  sawlogShare: number;
  pulpwoodShare: number;
  valueEur: number;
  priceCutType: PriceCutType;
  isForestLand: boolean;
  inventoryYear: number | null;
}

export interface RecommendedOperation {
  standId: string;
  standNumber: string | null;
  type: OperationType;
  timing: OperationTiming;
  year: number;
  reason: string;
  source: 'metsakeskus' | 'rules';
  estimatedRemovalM3: number | null;
  estimatedIncomeEur: number | null;
}

export type ForestValueWarningCode =
  | 'outdated_data'
  | 'small_parcel'
  | 'no_forest_land'
  | 'partial_coverage'
  | 'fallback_prices'
  | 'stale_cache';

export interface ForestValueWarning {
  code: ForestValueWarningCode;
  message: string;
}

export interface ForestValueResult {
  propertyId: number;
  areaHa: number;
  coveredAreaHa: number;
  forestLandAreaHa: number;
  totalVolumeM3: number;
  volumeM3PerHa: number;
  meanAgeYears: number | null;
  value: ValueRange;
  valueBySpecies: Record<TreeSpecies, number>;
  valueByAssortment: Record<TimberAssortment, number>;
  stands: StandValuation[];
  operations: RecommendedOperation[];
  data: {
    provider: 'metsakeskus' | 'mock' | 'manual';
    inventoryYearMin: number | null;
    inventoryYearMax: number | null;
    isOutdated: boolean;
  };
  prices: {
    source: 'luke' | 'fallback';
    region: string;
    period: string | null;
    fetchedAt: string;
  };
  warnings: ForestValueWarning[];
  computedAt: string;
}

export type ForestValueResponse =
  | { status: 'available'; result: ForestValueResult; stale: boolean }
  | { status: 'no_data'; message: string }
  | { status: 'error'; message: string };

// Owner-entered basics when no forest resource data is found
export interface ManualStandInput {
  species: TreeSpecies;
  ageYears: number;
  volumeM3PerHa: number;
}
