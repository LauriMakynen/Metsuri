import { describe, expect, it } from 'vitest';
import { parseLukePrices, priceRegionForMunicipality, priceRegionName } from '../lukePriceClient';
import { mapStandFeature, type StandFeature } from '../metsakeskusClient';
import lukeSample from './luke-prices.sample.json';
import standSample from './metsakeskus-stands.sample.json';

// Real responses (2026-10), geometries replaced with a small square
const [clearCutStand, deciduousStand] = standSample.features as unknown as StandFeature[];

describe('mapStandFeature (Metsäkeskus v2:stand)', () => {
  it('maps stand attributes and codes', () => {
    const stand = mapStandFeature(clearCutStand)!;
    expect(stand).toMatchObject({
      id: '34661551',
      standNumber: '21',
      areaHa: 2.169,
      developmentClass: '03',
      mainSpecies: 'pine',
      meanAgeYears: 63,
      stemsPerHa: 469,
      basalAreaM2PerHa: 19.11,
      fertilityClass: 3,
      soilType: 'mineral',
      isForestLand: true,
      inventoryYear: 2024,
      municipalityNumber: '182',
    });
  });

  it('splits stand volumes into species strata by volume shares', () => {
    const stand = mapStandFeature(clearCutStand)!;
    expect(stand.strata.map((s) => s.species)).toEqual(['pine', 'spruce']);
    const pine = stand.strata[0];
    expect(pine.volumeM3PerHa).toBeCloseTo(190.33 * 0.683);
    expect(pine.sawlogM3PerHa).toBeCloseTo(127.62 * 0.683);
    expect(pine.pulpwoodM3PerHa).toBeCloseTo(60.83 * 0.683);
    expect(pine.meanHeightM).toBe(21.13);
  });

  it('maps cutting and silviculture proposals', () => {
    expect(mapStandFeature(clearCutStand)!.proposedOperations).toEqual([
      { type: 'clear_cut', year: 2033 },
      { type: 'brush_clearing', year: 2033 },
    ]);
    expect(mapStandFeature(deciduousStand)!.proposedOperations).toEqual([{ type: 'thinning', year: 2026 }]);
  });

  it('treats generic deciduous (29) as birch and the "other" share as birch volume', () => {
    const stand = mapStandFeature(deciduousStand)!;
    expect(stand.mainSpecies).toBe('birch');
    expect(stand.strata.find((s) => s.species === 'birch')!.volumeM3PerHa).toBeCloseTo(254.74 * 0.851);
  });

  it('marks kitumaa and peatland correctly', () => {
    const base = clearCutStand.properties;
    const kitumaa = mapStandFeature({ ...clearCutStand, properties: { ...base, maingroup: '2', soiltype: '61', subgroup: '3' } })!;
    expect(kitumaa.isForestLand).toBe(false);
    expect(kitumaa.soilType).toBe('peatland');
  });

  it('uses the continuous cover proposal only without a periodic one', () => {
    const base = clearCutStand.properties;
    const ccs = mapStandFeature({
      ...clearCutStand,
      properties: { ...base, cuttingtype: null, silviculturetype: null, cuttingtype_ccs: '14', cuttingproposalyear_ccs: 2030 },
    })!;
    expect(ccs.proposedOperations).toEqual([{ type: 'selection_cut', year: 2030 }]);
  });

  it('ignores unknown development classes and missing geometry', () => {
    const base = clearCutStand.properties;
    expect(mapStandFeature({ ...clearCutStand, properties: { ...base, developmentclass: 'XX' } })!.developmentClass).toBeNull();
    expect(mapStandFeature({ ...clearCutStand, geometry: null })).toBeNull();
  });
});

describe('Luke price areas', () => {
  it('maps municipalities to price areas', () => {
    expect(priceRegionForMunicipality('091')).toBe('MPKH01'); // Helsinki
    expect(priceRegionForMunicipality('837')).toBe('MPKH02'); // Tampere (Pirkanmaa → Keski-Suomi)
    expect(priceRegionForMunicipality('305')).toBe('MPKH07'); // Kuusamo → Kainuu-Koillismaa
    expect(priceRegionForMunicipality('564')).toBe('MPKH06'); // Oulu
    expect(priceRegionForMunicipality('91')).toBe('MPKH01');
    expect(priceRegionForMunicipality('478')).toBe('SSS'); // Maarianhamina: no price area
    expect(priceRegionForMunicipality(null)).toBe('SSS');
    expect(priceRegionName('MPKH03')).toBe('Savo-Karjala');
  });
});

describe('parseLukePrices', () => {
  // Sample: months 2026M06–M08, areas SSS and MPKH01
  const ds = lukeSample as unknown as Parameters<typeof parseLukePrices>[0];

  it('takes the latest month of the price area', () => {
    const prices = parseLukePrices(ds, 'MPKH01')!;
    expect(prices.source).toBe('luke');
    expect(prices.region).toBe('Etelä-Suomi');
    expect(prices.period).toBe('2026M08');
    expect(prices.prices.regeneration).toEqual({
      pine_log: 79.89,
      spruce_log: 84.77,
      birch_log: 62.97,
      pine_pulp: 25.26,
      spruce_pulp: 27.23,
      birch_pulp: 26.18,
    });
  });

  it('falls back to the whole country for cells without trades', () => {
    const prices = parseLukePrices(ds, 'MPKH01')!;
    // Etelä-Suomi first thinning logs are ".." in all three months
    expect(prices.prices.first_thinning.pine_log).toBe(50.02);
    expect(prices.prices.first_thinning.pine_pulp).toBe(14.5);
  });

  it('works for the whole country', () => {
    const prices = parseLukePrices(ds, 'SSS')!;
    expect(prices.region).toBe('Koko maa');
    expect(prices.prices.regeneration.pine_log).toBe(79.74);
  });

  it('returns null when the response has no prices', () => {
    expect(parseLukePrices({ ...ds, value: ds.value.map(() => null) }, 'MPKH01')).toBeNull();
  });
});
