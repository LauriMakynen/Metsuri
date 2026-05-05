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
  | null;

// Marking types for forest management activities
export type MarkingType = 'vesakonhoito' | 'istutus' | 'harvennus' | 'avohakkuu' | 'muu_tyo';

// Geometry types for map elements
export type GeometryType = 'point' | 'line' | 'area' | 'note';

export interface Property {
  id: number;
  name: string;
  geometry: GeoJSONGeometry;
  created_at: string;
}

export interface Marking {
  id: number;
  property_id: number | null;
  type: MarkingType;
  geometry_type: GeometryType;
  title: string;
  description: string | null;
  geometry: GeoJSONGeometry;
  created_at: string;
  updated_at: string;
}
