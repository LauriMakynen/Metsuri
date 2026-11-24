import { booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf';
import type { GeoJSONGeometry } from '../types';

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle ("linnuntie") distance between two WGS84 points in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "800 m", "4,2 km" or "37 km". */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * How far a point is from a parcel: on the parcel, or the distance in km to its nearest edge.
 * Point-like parcels give the straight distance; null when the parcel has no area or point.
 */
export function parcelProximity(
  parcel: GeoJSONGeometry,
  position: { lat: number; lng: number }
): { onParcel: boolean; distanceKm: number } | null {
  if (!parcel) return null;
  if (parcel.type === 'Point') {
    return { onParcel: false, distanceKm: distanceKm(position, { lat: parcel.coordinates[1], lng: parcel.coordinates[0] }) };
  }
  if (parcel.type !== 'Polygon' && parcel.type !== 'MultiPolygon') return null;
  const feature = { type: 'Feature' as const, properties: {}, geometry: parcel };
  const pt = point([position.lng, position.lat]);
  if (booleanPointInPolygon(pt, feature)) return { onParcel: true, distanceKm: 0 };
  return { onParcel: false, distanceKm: Math.max(0, pointToPolygonDistance(pt, feature, { units: 'kilometers' })) };
}
