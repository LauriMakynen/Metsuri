/**
 * Geometry helpers for GPS activity tracking: painting the worked area
 * along the walked track and checking the position against the own parcel.
 */

import {
  area,
  buffer,
  distance,
  multiLineString,
  point,
  pointToPolygonDistance,
  simplify,
} from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { GeoJSONGeometry } from '../types';

// Radius of the painted swath around the walked track
export const BRUSH_RADIUS_M = 2;
// Ignore fixes worse than this – the paint would land in the wrong place
export const MAX_ACCURACY_M = 30;
// Skip new points closer than this to the previous one (GPS jitter while standing)
export const MIN_STEP_M = 1;
// Warn when this close to the parcel boundary
export const EDGE_WARNING_M = 15;

// [lng, lat] as in GeoJSON
export type TrackPoint = [number, number];

export type BoundaryStatus = 'unknown' | 'inside' | 'near-edge' | 'outside';

export function stepDistanceM(a: TrackPoint, b: TrackPoint): number {
  return distance(point(a), point(b), { units: 'meters' });
}

/**
 * Buffer the track segments into the painted work area.
 * A single-point segment is duplicated so it still paints a dot.
 */
export function paintTrack(segments: TrackPoint[][]): Polygon | MultiPolygon | null {
  const lines = segments
    .filter((s) => s.length > 0)
    .map((s) => (s.length === 1 ? [s[0], s[0]] : s));
  if (lines.length === 0) return null;

  // Simplify below the brush size to keep long sessions fast; shape stays the same
  const simplified = simplify(multiLineString(lines), { tolerance: 0.000003, highQuality: false });
  const painted = buffer(simplified, BRUSH_RADIUS_M, { units: 'meters' });
  return painted ? painted.geometry : null;
}

export function paintedAreaHa(geometry: Polygon | MultiPolygon | null): number {
  if (!geometry) return 0;
  return area({ type: 'Feature', geometry, properties: {} } as Feature<Polygon | MultiPolygon>) / 10000;
}

export function trackLengthM(segments: TrackPoint[][]): number {
  return segments.reduce((sum, s) => {
    let len = 0;
    for (let i = 1; i < s.length; i++) len += stepDistanceM(s[i - 1], s[i]);
    return sum + len;
  }, 0);
}

/** Where the position is relative to the own parcel boundary, and how far the edge is. */
export function boundaryStatus(
  position: TrackPoint,
  parcel: GeoJSONGeometry
): { status: BoundaryStatus; edgeDistanceM: number | null } {
  if (!parcel || (parcel.type !== 'Polygon' && parcel.type !== 'MultiPolygon')) {
    return { status: 'unknown', edgeDistanceM: null };
  }
  // Negative distance = inside; the absolute value is the distance to the nearest edge
  const d = pointToPolygonDistance(point(position), parcel as Polygon | MultiPolygon, { units: 'meters' });
  if (d > 0) return { status: 'outside', edgeDistanceM: d };
  return { status: -d < EDGE_WARNING_M ? 'near-edge' : 'inside', edgeDistanceM: -d };
}
