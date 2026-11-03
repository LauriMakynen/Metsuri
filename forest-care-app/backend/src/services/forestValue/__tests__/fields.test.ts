import { describe, expect, it } from 'vitest';
import { clipStandsToParcel, planarAreaHa } from '../clip';
import { mapFieldFeature, separateFields } from '../fields';
import { generateMockStands } from '../mockStands';
import { recommendOperations } from '../recommendations';
import { computeForestValue } from '../valuation';
import { PRICES, clipped, rect, stand } from './fixtures';

describe('separateFields', () => {
  const parcel = rect(395000, 6876000, 200, 100); // 2 ha
  const west = stand({ id: 'west', standNumber: '1', geometry: rect(395000, 6876000, 100, 100) });
  const east = stand({ id: 'east', standNumber: '2', geometry: rect(395100, 6876000, 100, 100) });
  const stands = [clipped(west), clipped(east)];

  it('keeps stands as they are without fields', () => {
    const result = separateFields(parcel, stands, [], new Set());
    expect(result.stands).toEqual(stands);
    expect(result.fields).toEqual([]);
  });

  it('cuts register fields out of stands and keeps only the part inside the parcel', () => {
    // Field over the eastern half of the east stand, reaching outside the parcel
    const field = { id: '0050101611', geometry: rect(395150, 6876000, 200, 100) };
    const result = separateFields(parcel, stands, [field], new Set());

    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({ source: 'register', fieldId: '0050101611', standId: null });
    expect(result.fields[0].areaHa).toBeCloseTo(0.5);

    const eastAfter = result.stands.find((s) => s.stand.id === 'east')!;
    expect(eastAfter.areaHaInParcel).toBeCloseTo(0.5);
    expect(planarAreaHa(eastAfter.geometry)).toBeCloseTo(0.5);
    expect(result.stands.find((s) => s.stand.id === 'west')!.areaHaInParcel).toBeCloseTo(1);
  });

  it('drops a stand that lies wholly on a field', () => {
    const field = { id: 'f1', geometry: rect(395100, 6876000, 100, 100) };
    const result = separateFields(parcel, stands, [field], new Set());
    expect(result.stands.map((s) => s.stand.id)).toEqual(['west']);
  });

  it('ignores register fields outside the parcel', () => {
    const far = { id: 'far', geometry: rect(500000, 7000000, 100, 100) };
    const result = separateFields(parcel, stands, [far], new Set());
    expect(result.fields).toEqual([]);
    expect(result.stands).toHaveLength(2);
  });

  it('turns stands the owner marked into fields', () => {
    const result = separateFields(parcel, stands, [], new Set(['east']));
    expect(result.stands.map((s) => s.stand.id)).toEqual(['west']);
    expect(result.fields).toEqual([
      expect.objectContaining({ source: 'owner', standId: 'east', standNumber: '2', fieldId: null }),
    ]);
    expect(result.fields[0].areaHa).toBeCloseTo(1);
  });

  it('does not count field area twice when an owner mark overlaps a register field', () => {
    const field = { id: 'f1', geometry: rect(395100, 6876000, 50, 100) };
    const result = separateFields(parcel, stands, [field], new Set(['east']));
    const total = result.fields.reduce((sum, f) => sum + f.areaHa, 0);
    expect(total).toBeCloseTo(1);
    expect(result.fields.find((f) => f.source === 'owner')!.areaHa).toBeCloseTo(0.5);
  });
});

describe('fields in the valuation', () => {
  const parcel = rect(395000, 6876000, 600, 400); // 24 ha

  it('gives no value or recommendations to field area', () => {
    const allStands = clipStandsToParcel(parcel, generateMockStands(parcel, 0));
    // The northern half of the parcel is field
    const field = { id: 'pelto', geometry: rect(395000, 6876200, 600, 200) };
    const { stands, fields } = separateFields(parcel, allStands, [field], new Set());
    const fieldAreaHa = fields.reduce((sum, f) => sum + f.areaHa, 0);
    expect(fieldAreaHa).toBeCloseTo(12);

    const forestOnly = computeForestValue({
      propertyId: 1,
      parcelAreaHa: planarAreaHa(parcel),
      stands,
      prices: PRICES,
      provider: 'mock',
      operations: recommendOperations(stands, PRICES, 2026),
      currentYear: 2026,
      fieldAreaHa,
    });
    const whole = computeForestValue({
      propertyId: 1,
      parcelAreaHa: planarAreaHa(parcel),
      stands: allStands,
      prices: PRICES,
      provider: 'mock',
      operations: [],
      currentYear: 2026,
    });

    expect(forestOnly.coveredAreaHa).toBeCloseTo(12);
    expect(forestOnly.value.midEur).toBeLessThan(whole.value.midEur);
    // The forest half is fully covered by stands, so no partial coverage warning
    expect(forestOnly.warnings.map((w) => w.code)).not.toContain('partial_coverage');
    // Every recommendation is for a stand that still has forest left
    const forestIds = new Set(stands.map((s) => s.stand.id));
    expect(forestOnly.operations.every((o) => forestIds.has(o.standId))).toBe(true);
  });
});

describe('mapFieldFeature (Ruokavirasto LPIS)', () => {
  it('maps a field parcel feature', () => {
    const field = mapFieldFeature({
      geometry: rect(345313, 6998517, 100, 100),
      properties: { PERUSLOHKOTUNNUS: '0050101611', TUNNUS: 3629 },
    });
    expect(field).toEqual({ id: '0050101611', geometry: rect(345313, 6998517, 100, 100) });
  });

  it('skips features without an area geometry', () => {
    expect(mapFieldFeature({ geometry: null, properties: {} })).toBeNull();
  });
});
