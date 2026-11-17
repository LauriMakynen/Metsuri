import type { PublicWorkRequest } from '../types';

// Price and work-area ranges for browsing work requests. A range is open at the top
// ("alle 500 €" = below 500) except the last one ("yli …" = at least).

export interface RangeOption {
  value: string;
  label: string;
  min?: number;
  max?: number;
}

export const PRICE_RANGES: RangeOption[] = [
  { value: 'lt500', label: 'Alle 500 €', max: 500 },
  { value: 'lt2000', label: 'Alle 2 000 €', max: 2000 },
  { value: 'lt10000', label: 'Alle 10 000 €', max: 10_000 },
  { value: 'gte10000', label: 'Yli 10 000 €', min: 10_000 },
];

export const AREA_RANGES: RangeOption[] = [
  { value: 'lt1', label: 'Alle 1 ha', max: 1 },
  { value: 'lt5', label: 'Alle 5 ha', max: 5 },
  { value: 'lt20', label: 'Alle 20 ha', max: 20 },
  { value: 'gte20', label: 'Yli 20 ha', min: 20 },
];

/** Whether a value falls in the chosen range; no range chosen lets everything through. */
export function inRange(value: number | null, rangeValue: string | null, ranges: RangeOption[]): boolean {
  const range = ranges.find((r) => r.value === rangeValue);
  if (!range) return true;
  // A request without the value (no price, or a point-like work with no area) can't match a range
  if (value === null) return false;
  return (range.min === undefined || value >= range.min) && (range.max === undefined || value < range.max);
}

/** Owner's price and work area of a request inside the chosen ranges. */
export function matchesRequestFilters(
  request: Pick<PublicWorkRequest, 'target_price_eur' | 'area_ha'>,
  priceRange: string | null,
  areaRange: string | null
): boolean {
  return inRange(request.target_price_eur, priceRange, PRICE_RANGES) && inRange(request.area_ha, areaRange, AREA_RANGES);
}

export function rangeLabel(rangeValue: string | null, ranges: RangeOption[]): string | null {
  return ranges.find((r) => r.value === rangeValue)?.label ?? null;
}
