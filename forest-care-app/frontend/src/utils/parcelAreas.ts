import { area, pointOnFeature, polygon } from '@turf/turf';
import type { GeoJSONGeometry } from '../types';

// One property (kiinteistötunnus) is one forest, but MML may draw it as several separate
// areas (palstat). These helpers name them "Alue 1, 2, …" for the UI, largest first.

export interface ParcelArea {
  number: number;
  areaHa: number;
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  // A point inside the area for its map label, [lat, lng]
  labelPosition: [number, number];
}

export function parcelAreas(geometry: GeoJSONGeometry): ParcelArea[] {
  if (!geometry) return [];
  const rings =
    geometry.type === 'MultiPolygon' ? geometry.coordinates : geometry.type === 'Polygon' ? [geometry.coordinates] : [];
  return rings
    .map((coordinates) => {
      const feature = polygon(coordinates);
      const [lng, lat] = pointOnFeature(feature).geometry.coordinates;
      return {
        areaHa: area(feature) / 10_000,
        geometry: { type: 'Polygon' as const, coordinates },
        labelPosition: [lat, lng] as [number, number],
      };
    })
    .sort((a, b) => b.areaHa - a.areaHa)
    .map((part, index) => ({ ...part, number: index + 1 }));
}

/** Number of separate areas, 1 for an ordinary single-area property and 0 without an area. */
export function parcelAreaCount(geometry: GeoJSONGeometry): number {
  if (!geometry) return 0;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.length;
  return geometry.type === 'Polygon' ? 1 : 0;
}
