/**
 * Stumpage prices from Luonnonvarakeskus (Luke) statistics database, PxWeb API.
 *
 * Table: LUKE_PXWEB_PRICE_URL, e.g.
 *   https://statdb.luke.fi/PxWeb/api/v1/fi/LUKE/met/teokau/kk/0100_teokau.px
 *   "Teollisuuspuun kauppa hinta-alueittain kuukausittain" (verified 2026-10)
 * Dimensions:
 *   INFO  E_M3 = price €/m³ (M3T = volume)
 *   M     month, e.g. 2026M08
 *   MPKH  price area: SSS = whole country, MPKH01…MPKH08 (8 areas since 2020)
 *   KAUP  UUD / HAR / ENS = standing sales (pystykauppa) in regeneration
 *         felling / thinning / first thinning
 *   PTL   TUK_MA, TUK_KU, TUK_KO (logs), KUI_MA, KUI_KU, KUI_KO (pulpwood)
 *
 * Cells with too few trades are published as ".." (null). For each price the
 * latest of the last MONTHS months is used, first from the parcel's price area,
 * then from the whole country, then from the config fallback.
 */
import fallbackConfig from '../../config/fallbackStumpagePrices.json';
import regionConfig from '../../config/municipalityPriceRegions.json';
import { fetchJson } from './metsakeskusClient';
import type { PriceCutType, StumpagePriceTable, StumpagePrices, TimberAssortment } from './types';

const MONTHS = 3;
export const WHOLE_COUNTRY = 'SSS';

const CUT_TYPE_CODES: Record<PriceCutType, string> = {
  regeneration: 'UUD',
  thinning: 'HAR',
  first_thinning: 'ENS',
};

const ASSORTMENT_CODES: Record<TimberAssortment, string> = {
  pine_log: 'TUK_MA',
  spruce_log: 'TUK_KU',
  birch_log: 'TUK_KO',
  pine_pulp: 'KUI_MA',
  spruce_pulp: 'KUI_KU',
  birch_pulp: 'KUI_KO',
};

const regionNames = regionConfig.regionNames as Record<string, string>;
const municipalities = regionConfig.municipalities as Record<string, string>;

/** Luke price area code for a municipality number ("091"), whole country if unknown. */
export function priceRegionForMunicipality(municipalityNumber: string | null | undefined): string {
  if (!municipalityNumber) return WHOLE_COUNTRY;
  return municipalities[municipalityNumber.padStart(3, '0')] ?? WHOLE_COUNTRY;
}

export function priceRegionName(code: string): string {
  return regionNames[code] ?? regionNames[WHOLE_COUNTRY];
}

export function fallbackPrices(now = new Date()): StumpagePrices {
  return {
    source: 'fallback',
    region: fallbackConfig.region,
    period: fallbackConfig.period,
    fetchedAt: now.toISOString(),
    prices: fallbackConfig.prices as StumpagePriceTable,
  };
}

interface JsonStat2 {
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number> | string[] } }>;
  value: (number | null)[];
}

function categoryIndex(ds: JsonStat2, dim: string): Record<string, number> {
  const index = ds.dimension[dim]?.category.index;
  if (!index) return {};
  return Array.isArray(index) ? Object.fromEntries(index.map((code, i) => [code, i])) : index;
}

/** Pick prices from a json-stat2 response. Exported for tests. */
export function parseLukePrices(ds: JsonStat2, regionCode: string, now = new Date()): StumpagePrices | null {
  const idx = Object.fromEntries(ds.id.map((dim) => [dim, categoryIndex(ds, dim)]));
  const strides = ds.size.map((_, i) => ds.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const months = Object.entries(idx.M ?? {})
    .sort(([, a], [, b]) => b - a) // newest first
    .map(([code]) => code);

  const cell = (coords: Record<string, string>): number | null => {
    let offset = 0;
    for (let i = 0; i < ds.id.length; i++) {
      const position = idx[ds.id[i]][coords[ds.id[i]]];
      if (position === undefined) return null;
      offset += position * strides[i];
    }
    const value = ds.value[offset];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };

  const fallback = fallbackConfig.prices as StumpagePriceTable;
  const table = {} as StumpagePriceTable;
  let latestUsed: string | null = null;
  let fromLuke = 0;
  let fromRegion = 0;

  for (const [cutType, kaup] of Object.entries(CUT_TYPE_CODES) as [PriceCutType, string][]) {
    table[cutType] = {} as Record<TimberAssortment, number>;
    for (const [assortment, ptl] of Object.entries(ASSORTMENT_CODES) as [TimberAssortment, string][]) {
      let price: number | null = null;
      for (const area of regionCode === WHOLE_COUNTRY ? [WHOLE_COUNTRY] : [regionCode, WHOLE_COUNTRY]) {
        for (const month of months) {
          price = cell({ INFO: 'E_M3', M: month, MPKH: area, KAUP: kaup, PTL: ptl });
          if (price !== null) {
            if (!latestUsed || month > latestUsed) latestUsed = month;
            if (area === regionCode) fromRegion++;
            break;
          }
        }
        if (price !== null) break;
      }
      if (price !== null) fromLuke++;
      table[cutType][assortment] = price ?? fallback[cutType][assortment];
    }
  }

  if (fromLuke === 0) return null;
  return {
    source: 'luke',
    // Name the area only if most prices really came from it
    region: fromRegion >= fromLuke / 2 ? priceRegionName(regionCode) : priceRegionName(WHOLE_COUNTRY),
    period: latestUsed,
    fetchedAt: now.toISOString(),
    prices: table,
  };
}

export async function fetchLukePrices(regionCode: string): Promise<StumpagePrices | null> {
  const url = process.env.LUKE_PXWEB_PRICE_URL;
  if (!url) return null;
  const areas = regionCode === WHOLE_COUNTRY ? [WHOLE_COUNTRY] : [regionCode, WHOLE_COUNTRY];
  const query = {
    query: [
      { code: 'INFO', selection: { filter: 'item', values: ['E_M3'] } },
      { code: 'M', selection: { filter: 'top', values: [String(MONTHS)] } },
      { code: 'MPKH', selection: { filter: 'item', values: areas } },
      { code: 'KAUP', selection: { filter: 'item', values: Object.values(CUT_TYPE_CODES) } },
      { code: 'PTL', selection: { filter: 'item', values: Object.values(ASSORTMENT_CODES) } },
    ],
    response: { format: 'json-stat2' },
  };
  const ds = (await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })) as JsonStat2;
  return parseLukePrices(ds, regionCode);
}
