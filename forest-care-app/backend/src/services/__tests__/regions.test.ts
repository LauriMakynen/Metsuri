import { describe, expect, it } from 'vitest';
import { booleanPointInPolygon, point } from '@turf/turf';
import { REGIONS, isValidRegionCode } from '../regions';

function regionAt(lng: number, lat: number): string | undefined {
  return REGIONS.features.find((f) => booleanPointInPolygon(point([lng, lat]), f))?.properties.name;
}

describe('regions', () => {
  it('contains all 19 Finnish regions', () => {
    expect(REGIONS.features).toHaveLength(19);
    const names = REGIONS.features.map((f) => f.properties.name);
    expect(names).toEqual(expect.arrayContaining(['Pohjanmaa', 'Lappi', 'Keski-Suomi', 'Satakunta']));
  });

  it('places towns in the right region', () => {
    expect(regionAt(25.75, 62.24)).toBe('Keski-Suomi'); // Jyväskylä
    expect(regionAt(21.62, 63.1)).toBe('Pohjanmaa'); // Vaasa
    expect(regionAt(25.73, 66.5)).toBe('Lappi'); // Rovaniemi
    expect(regionAt(21.8, 61.49)).toBe('Satakunta'); // Pori
  });

  it('validates region codes', () => {
    expect(isValidRegionCode('13')).toBe(true);
    expect(isValidRegionCode('03')).toBe(false);
    expect(isValidRegionCode('1; DROP')).toBe(false);
  });
});
