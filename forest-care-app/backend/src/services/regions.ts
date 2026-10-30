import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import regionsData from '../data/regions.json';

export interface RegionProperties {
  // Two-digit maakunta code, e.g. '13' = Keski-Suomi
  code: string;
  name: string;
}

// Finnish regions (maakunnat) 2025, generalised 1:4 500 000.
// Source: Statistics Finland, geo.stat.fi WFS layer tilastointialueet:maakunta4500k_2025 (CC BY 4.0).
export const REGIONS = regionsData as FeatureCollection<Polygon | MultiPolygon, RegionProperties>;

const REGION_CODE_REGEX = /^\d{2}$/;

export function isValidRegionCode(value: string): boolean {
  return REGION_CODE_REGEX.test(value) && REGIONS.features.some((f) => f.properties.code === value);
}
