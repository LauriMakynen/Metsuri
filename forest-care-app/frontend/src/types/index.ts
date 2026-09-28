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
}

export interface CadastreFeatureProperties {
  propertyCode: string;
  name: string;
  areaHa?: number;
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

export interface ForestStandData {
  id: number;
  property_id: number;
  pine_volume_m3: number | null;
  spruce_volume_m3: number | null;
  birch_volume_m3: number | null;
  other_volume_m3: number | null;
  total_volume_m3: number | null;
  development_class: string | null;
  soil_type: string | null;
  data_source: string | null;
  data_year: number | null;
  created_at: string;
  updated_at: string;
}

export interface ForestValuation {
  id: number;
  property_id: number;
  estimated_value_eur: number | null;
  timber_value_eur: number | null;
  land_value_eur: number | null;
  valuation_method: string | null;
  created_at: string;
}

export interface ForestDataResponse {
  status: 'available' | 'not_available';
  message?: string;
  data: ForestStandData | null;
}

export interface ForestValuationResponse {
  status: 'available' | 'not_available';
  message?: string;
  data: ForestValuation | null;
}
