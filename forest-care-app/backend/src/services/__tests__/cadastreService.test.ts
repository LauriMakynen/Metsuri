import { describe, expect, it } from 'vitest';
import { mergeCadastreFeatures, parsePropertyCode } from '../cadastreService';

// Square parcel of roughly sizeM × sizeM metres at lng/lat (WGS84), as a closed ring
function square(lng: number, lat: number, sizeM: number): [number, number][][] {
  const dLat = sizeM / 111320;
  const dLng = sizeM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[[lng, lat], [lng + dLng, lat], [lng + dLng, lat + dLat], [lng, lat + dLat], [lng, lat]]];
}

// Shape of an MML PalstanSijaintitiedot response: one feature per parcel (palsta)
function mmlParcel(coordinates: [number, number][][]) {
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates },
    properties: {
      kiinteistotunnus: '09100299010100',
      kiinteistotunnuksenEsitysmuoto: '91-2-9901-100',
    },
  };
}

describe('mergeCadastreFeatures', () => {
  it('merges every parcel of a property into one MultiPolygon', () => {
    const response = {
      type: 'FeatureCollection',
      features: [mmlParcel(square(25.0, 62.0, 100)), mmlParcel(square(25.01, 62.0, 200))],
    };

    const result = mergeCadastreFeatures(response, '91-2-9901-100');

    expect(result?.geometry.type).toBe('MultiPolygon');
    expect(result?.geometry.coordinates).toHaveLength(2);
    expect(result?.properties.parcelCount).toBe(2);
    expect(result?.properties.name).toBe('91-2-9901-100');
    // 1 ha + 4 ha: the area covers both parcels, not just the first one
    expect(result?.properties.areaHa).toBeCloseTo(5, 1);
  });

  it('keeps a single-parcel property as a Polygon', () => {
    const result = mergeCadastreFeatures(
      { type: 'FeatureCollection', features: [mmlParcel(square(25.0, 62.0, 100))] },
      '91-2-9901-100'
    );

    expect(result?.geometry.type).toBe('Polygon');
    expect(result?.properties.parcelCount).toBe(1);
    expect(result?.properties.areaHa).toBeCloseTo(1, 1);
  });

  it('flattens MultiPolygon parcels together with Polygon parcels', () => {
    const multi = {
      type: 'Feature',
      geometry: { type: 'MultiPolygon', coordinates: [square(25.0, 62.0, 100), square(25.02, 62.0, 100)] },
      properties: {},
    };
    const result = mergeCadastreFeatures(
      { type: 'FeatureCollection', features: [multi, mmlParcel(square(25.04, 62.0, 100))] },
      '91-2-9901-100'
    );

    expect(result?.geometry.type).toBe('MultiPolygon');
    expect(result?.properties.parcelCount).toBe(3);
  });

  it('accepts a single Feature as well as a FeatureCollection', () => {
    const result = mergeCadastreFeatures(mmlParcel(square(25.0, 62.0, 100)), '91-2-9901-100');
    expect(result?.geometry.type).toBe('Polygon');
  });

  it('returns null when there is no parcel', () => {
    expect(mergeCadastreFeatures({ type: 'FeatureCollection', features: [] }, '1-2-3-4')).toBeNull();
    expect(mergeCadastreFeatures(null, '1-2-3-4')).toBeNull();
    expect(
      mergeCadastreFeatures(
        { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [25, 62] } }] },
        '1-2-3-4'
      )
    ).toBeNull();
  });
});

describe('parsePropertyCode', () => {
  it.each([
    ['91-2-9901-100', '91-2-9901-100', '09100299010100'],
    ['091-002-9901-0100', '91-2-9901-100', '09100299010100'],
    ['145 414 5 187', '145-414-5-187', '14541400050187'],
    ['14541400050187', '145-414-5-187', '14541400050187'],
  ])('%s -> %s / %s', (input, display, canonical) => {
    expect(parsePropertyCode(input)).toEqual({ display, canonical });
  });

  it.each(['12-34', 'abc-def', '1234-1-1-1', ''])('rejects %j', (input) => {
    expect(parsePropertyCode(input)).toBeNull();
  });
});
