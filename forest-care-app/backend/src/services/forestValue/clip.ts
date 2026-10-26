/**
 * Clip forest stands to a parcel polygon.
 *
 * Both inputs are in ETRS-TM35FIN (EPSG:3067). Turf's intersect works on plain
 * planar coordinates, so it is used as is; turf.area, however, assumes WGS84
 * and would give wrong results for metric coordinates, so areas are computed
 * with the planar shoelace formula instead. In TM35FIN the scale error is well
 * under 0.1 % across Finland, which is negligible here.
 */
import { featureCollection, intersect, multiPolygon, polygon } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import type { ForestStand, PolygonGeometry } from './types';

export interface ClippedStand {
  stand: ForestStand;
  /** Part of the stand inside the parcel, EPSG:3067. */
  geometry: PolygonGeometry;
  areaHaInParcel: number;
}

/** Slivers smaller than this are digitising noise along shared boundaries. */
export const MIN_CLIPPED_AREA_HA = 0.01;

function ringAreaM2(ring: number[][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Planar area in square metres. Outer ring minus holes. */
export function planarAreaM2(geometry: PolygonGeometry): number {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const rings of polygons) {
    rings.forEach((ring, index) => {
      total += index === 0 ? ringAreaM2(ring) : -ringAreaM2(ring);
    });
  }
  return total;
}

export function planarAreaHa(geometry: PolygonGeometry): number {
  return planarAreaM2(geometry) / 10_000;
}

function toFeature(geometry: PolygonGeometry): Feature<Polygon | MultiPolygon> {
  return geometry.type === 'Polygon'
    ? polygon(geometry.coordinates)
    : multiPolygon(geometry.coordinates);
}

export function clipStandsToParcel(parcel: PolygonGeometry, stands: ForestStand[]): ClippedStand[] {
  const parcelFeature = toFeature(parcel);
  const clipped: ClippedStand[] = [];

  for (const stand of stands) {
    let intersection: Feature<Polygon | MultiPolygon> | null;
    try {
      intersection = intersect(featureCollection([parcelFeature, toFeature(stand.geometry)]));
    } catch {
      // Invalid source geometry (self-intersection etc.): skip the stand rather than fail the parcel
      continue;
    }
    if (!intersection) continue;

    const geometry = intersection.geometry as PolygonGeometry;
    const areaHaInParcel = planarAreaHa(geometry);
    if (areaHaInParcel < MIN_CLIPPED_AREA_HA) continue;

    clipped.push({ stand, geometry, areaHaInParcel });
  }

  return clipped;
}
