/**
 * Measurement utilities for distance and area calculations
 * Uses Turf.js for accurate WGS84 geographic calculations
 */

import { distance, area, polygon as turfPolygon } from '@turf/turf';
import type { GeoJSONGeometry } from '../types';

/**
 * Calculate distance between two coordinates in meters
 * @param lat1 Latitude of point 1
 * @param lng1 Longitude of point 1
 * @param lat2 Latitude of point 2
 * @param lng2 Longitude of point 2
 * @returns Distance in meters
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  try {
    const dist = distance([lng1, lat1], [lng2, lat2], { units: 'meters' });
    return dist;
  } catch {
    return 0;
  }
}

/**
 * Format distance for display
 * @param meters Distance in meters
 * @returns Formatted string (e.g., "245 m" or "1.42 km")
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Calculate area of a polygon in hectares
 * @param geometry GeoJSON polygon geometry
 * @returns Area in hectares
 */
export function calculateAreaHa(geometry: GeoJSONGeometry): number | null {
  if (!geometry || geometry.type !== 'Polygon') {
    return null;
  }

  try {
    // Turf expects [lon, lat] coordinate order
    const feat = turfPolygon(geometry.coordinates as number[][][]);
    const areaM2 = area(feat); // Returns square meters
    const areaHa = areaM2 / 10000; // Convert m² to hectares (1 ha = 10,000 m²)
    return Number(areaHa.toFixed(2));
  } catch (err) {
    console.error('Error calculating area:', err);
    return null;
  }
}

/**
 * Format area for display
 * @param hectares Area in hectares
 * @returns Formatted string (e.g., "0.52 ha")
 */
export function formatArea(hectares: number | null | undefined): string {
  if (hectares === null || hectares === undefined) {
    return 'N/A';
  }

  const value = typeof hectares === 'number' ? hectares : Number.parseFloat(String(hectares));
  if (!Number.isFinite(value)) {
    return 'N/A';
  }

  return `${value.toFixed(2)} ha`;
}

/**
 * Format distance for display with custom precision
 * @param meters Distance in meters
 * @param precision Decimal places for km
 * @returns Formatted string
 */
export function formatDistanceWithPrecision(meters: number, precision: number = 2): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(precision)} km`;
}
