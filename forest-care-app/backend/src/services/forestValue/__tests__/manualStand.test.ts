import { describe, expect, it } from 'vitest';
import { clipStandsToParcel } from '../clip';
import { developmentClassFor, manualStand, validateManualInput } from '../manualStand';
import { recommendOperations } from '../recommendations';
import { computeForestValue } from '../valuation';
import { PRICES, rect } from './fixtures';

describe('validateManualInput', () => {
  it('accepts valid input and rounds the age', () => {
    expect(validateManualInput({ species: 'spruce', ageYears: '62.4', volumeM3PerHa: 210 })).toEqual({
      value: { species: 'spruce', ageYears: 62, volumeM3PerHa: 210 },
    });
  });

  it('rejects unknown species and out-of-range numbers', () => {
    expect(validateManualInput({ species: 'oak', ageYears: 50, volumeM3PerHa: 100 })).toHaveProperty('error');
    expect(validateManualInput({ species: 'pine', ageYears: -1, volumeM3PerHa: 100 })).toHaveProperty('error');
    expect(validateManualInput({ species: 'pine', ageYears: 50, volumeM3PerHa: 900 })).toHaveProperty('error');
    expect(validateManualInput({ species: 'pine', ageYears: 'x', volumeM3PerHa: 100 })).toHaveProperty('error');
    expect(validateManualInput(undefined)).toHaveProperty('error');
  });
});

describe('developmentClassFor', () => {
  it('derives the class from age and volume', () => {
    expect(developmentClassFor({ species: 'spruce', ageYears: 2, volumeM3PerHa: 0 })).toBe('T1');
    expect(developmentClassFor({ species: 'spruce', ageYears: 12, volumeM3PerHa: 15 })).toBe('T2');
    expect(developmentClassFor({ species: 'spruce', ageYears: 28, volumeM3PerHa: 90 })).toBe('02');
    expect(developmentClassFor({ species: 'spruce', ageYears: 50, volumeM3PerHa: 180 })).toBe('03');
    expect(developmentClassFor({ species: 'spruce', ageYears: 75, volumeM3PerHa: 250 })).toBe('04');
    expect(developmentClassFor({ species: 'pine', ageYears: 75, volumeM3PerHa: 250 })).toBe('03');
  });
});

describe('manual stand through the pipeline', () => {
  it('values the whole parcel with wide uncertainty', () => {
    const parcel = rect(0, 0, 200, 100); // 2 ha
    const stand = manualStand(parcel, 2, { species: 'spruce', ageYears: 80, volumeM3PerHa: 200 }, 2026);
    const clipped = clipStandsToParcel(parcel, [stand]);
    const result = computeForestValue({
      propertyId: 1,
      parcelAreaHa: 2,
      stands: clipped,
      prices: PRICES,
      provider: 'manual',
      operations: recommendOperations(clipped, PRICES, 2026),
      currentYear: 2026,
    });
    expect(result.totalVolumeM3).toBeCloseTo(400);
    expect(result.value.uncertainty).toBe(0.3);
    expect(result.value.midEur).toBeGreaterThan(0);
    expect(result.operations[0].type).toBe('clear_cut');
    expect(result.warnings).toEqual([]);
  });
});
