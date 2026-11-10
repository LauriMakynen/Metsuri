/**
 * Yearly stumpage prices since 1990 for the return history ("tuottohistoria").
 *
 * Source: Luke, "Puukaupan pitkä aikasarja, koko maa 1949–" (PxWeb table 0300_teokau.px),
 * standing sales (pystykauppa), €/m³ by assortment. Only the whole country is published
 * this far back, so the series is used as an index: a past price is today's price for the
 * parcel (its own price area and cut type) scaled by how the national price has changed.
 */
import costOfLivingConfig from '../../config/costOfLivingIndex.json';
import bundled from '../../config/stumpagePriceHistory.json';
import { fetchJson } from './metsakeskusClient';
import type { TimberAssortment } from './types';

const DEFAULT_URL = 'https://statdb.luke.fi/PxWeb/api/v1/fi/LUKE/met/teokau/v/0300_teokau.px';
const FIRST_YEAR = 1990;
const CACHE_MS = 24 * 60 * 60 * 1000;

const ASSORTMENT_CODES: Record<TimberAssortment, string> = {
  pine_log: 'TUK_MA',
  spruce_log: 'TUK_KU',
  birch_log: 'TUK_KO',
  pine_pulp: 'KUI_MA',
  spruce_pulp: 'KUI_KU',
  birch_pulp: 'KUI_KO',
};

/** €/m³ by assortment and year */
export type PriceSeries = Record<TimberAssortment, Record<number, number>>;

export interface PriceHistory {
  source: 'luke' | 'bundled';
  /** Latest year that has a price for every assortment */
  latestYear: number;
  series: PriceSeries;
  /**
   * Cost-of-living index by year (Statistics Finland, elinkustannusindeksi 1951:10=100),
   * for inflation-adjusted returns. Missing in hand-built histories (tests).
   */
  costOfLiving?: Record<number, number>;
}

const COST_OF_LIVING_URL = 'https://pxdata.stat.fi/PxWeb/api/v1/fi/StatFin/khi/11xm.px';

function bundledCostOfLiving(): Record<number, number> {
  return Object.fromEntries(Object.entries(costOfLivingConfig.index).map(([year, value]) => [Number(year), value]));
}

/** Yearly index from a json-stat2 response of table khi/11xm. Exported for tests. */
export function parseCostOfLiving(ds: {
  dimension: Record<string, { category: { index: Record<string, number> } }>;
  value: (number | null)[];
}): Record<number, number> | null {
  const yearIndex = ds.dimension.timeperiod_y?.category.index;
  if (!yearIndex) return null;
  const index: Record<number, number> = {};
  for (const [year, position] of Object.entries(yearIndex)) {
    const value = ds.value[position];
    if (Number(year) >= FIRST_YEAR && typeof value === 'number' && value > 0) index[Number(year)] = value;
  }
  return Object.keys(index).length > 0 ? index : null;
}

async function fetchCostOfLiving(): Promise<Record<number, number> | null> {
  try {
    const ds = await fetchJson(process.env.COST_OF_LIVING_URL || COST_OF_LIVING_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: [], response: { format: 'json-stat2' } }),
    });
    return parseCostOfLiving(ds as Parameters<typeof parseCostOfLiving>[0]);
  } catch (error) {
    console.warn('Cost-of-living index fetch failed:', error instanceof Error ? error.message : error);
    return null;
  }
}

function latestCommonYear(series: PriceSeries): number {
  const assortments = Object.keys(ASSORTMENT_CODES) as TimberAssortment[];
  const years = Object.keys(series[assortments[0]]).map(Number).sort((a, b) => b - a);
  return years.find((year) => assortments.every((a) => series[a][year] !== undefined)) ?? 0;
}

export function bundledPriceHistory(): PriceHistory {
  const series = {} as PriceSeries;
  for (const assortment of Object.keys(ASSORTMENT_CODES) as TimberAssortment[]) {
    series[assortment] = {};
    const byYear = (bundled.series as Record<string, Record<string, number>>)[assortment] ?? {};
    for (const [year, price] of Object.entries(byYear)) series[assortment][Number(year)] = price;
  }
  return { source: 'bundled', latestYear: latestCommonYear(series), series, costOfLiving: bundledCostOfLiving() };
}

interface JsonStat2 {
  id: string[];
  size: number[];
  dimension: Record<string, { category: { index: Record<string, number> } }>;
  value: (number | null)[];
}

/** Read the yearly series from a json-stat2 response. Exported for tests. */
export function parsePriceHistory(ds: JsonStat2): PriceHistory | null {
  const yearIndex = ds.dimension.KA?.category.index;
  const assortmentIndex = ds.dimension.PTL?.category.index;
  if (!yearIndex || !assortmentIndex) return null;
  const strides = ds.size.map((_, i) => ds.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const yearStride = strides[ds.id.indexOf('KA')];
  const assortmentStride = strides[ds.id.indexOf('PTL')];

  const series = {} as PriceSeries;
  for (const [assortment, code] of Object.entries(ASSORTMENT_CODES) as [TimberAssortment, string][]) {
    series[assortment] = {};
    if (assortmentIndex[code] === undefined) return null;
    for (const [year, position] of Object.entries(yearIndex)) {
      if (Number(year) < FIRST_YEAR) continue;
      const value = ds.value[position * yearStride + assortmentIndex[code] * assortmentStride];
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) series[assortment][Number(year)] = value;
    }
  }
  const latestYear = latestCommonYear(series);
  return latestYear > 0 ? { source: 'luke', latestYear, series } : null;
}

let cache: { history: PriceHistory; at: number } | null = null;

/** Yearly price series: live from Luke (cached for a day), otherwise the bundled copy. */
export async function getPriceHistory(): Promise<PriceHistory> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.history;
  let history: PriceHistory | null = null;
  // PRICE_HISTORY_MODE=bundled skips the network (tests, offline development)
  if (process.env.PRICE_HISTORY_MODE !== 'bundled') {
    try {
      const ds = (await fetchJson(process.env.LUKE_PXWEB_HISTORY_URL || DEFAULT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: [
            { code: 'INFO', selection: { filter: 'item', values: ['E_M3'] } },
            { code: 'KAUP', selection: { filter: 'item', values: ['PKAUP'] } },
            { code: 'PTL', selection: { filter: 'item', values: Object.values(ASSORTMENT_CODES) } },
          ],
          response: { format: 'json-stat2' },
        }),
      })) as JsonStat2;
      history = parsePriceHistory(ds);
    } catch (error) {
      console.warn('Luke price history fetch failed:', error instanceof Error ? error.message : error);
    }
  }
  if (!history) return bundledPriceHistory();
  history.costOfLiving = (await fetchCostOfLiving()) ?? bundledCostOfLiving();
  cache = { history, at: Date.now() };
  return history;
}
