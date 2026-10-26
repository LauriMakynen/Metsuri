/**
 * Forest parcel value: orchestrates parcel geometry, stand data, prices,
 * calculation and caching. The calculation itself lives in pure modules
 * (clip, valuation, recommendations).
 *
 * Caching:
 *  - forest_value_cache: one computed result per property, fresh for
 *    FOREST_VALUE_CACHE_HOURS (default 24 h) and while the geometry is unchanged.
 *    An older result is still served (marked stale) when Metsäkeskus fails.
 *  - stumpage_price_cache: Luke prices per price area, refreshed every 24 h;
 *    stale prices are used before the config fallback.
 */
import pool from '../../db/pool';
import { clipStandsToParcel, planarAreaHa } from './clip';
import { DEMO_PARCEL_WGS84 } from './demoParcel';
import { fallbackPrices, fetchLukePrices, priceRegionForMunicipality } from './lukePriceClient';
import { fetchStandsInBbox, type MetsakeskusStand } from './metsakeskusClient';
import { manualStand } from './manualStand';
import { generateMockStands } from './mockStands';
import { recommendOperations } from './recommendations';
import type {
  ForestDataProvider,
  ForestStand,
  ForestValueResponse,
  ForestValueResult,
  ManualStandInput,
  PolygonGeometry,
  StumpagePrices,
} from './types';
import { computeForestValue } from './valuation';

const HOUR_MS = 60 * 60 * 1000;
const PRICE_CACHE_HOURS = 24;

function cacheHours(): number {
  const hours = Number(process.env.FOREST_VALUE_CACHE_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : 24;
}

/** 'mock' unless FOREST_DATA_MODE=live, or the mode is unset and a WFS URL is configured. */
export function forestDataMode(): 'mock' | 'live' {
  const mode = process.env.FOREST_DATA_MODE;
  if (mode === 'mock' || mode === 'live') return mode;
  return process.env.METSAKESKUS_WFS_URL ? 'live' : 'mock';
}

export const NO_DATA_MESSAGE =
  'Palstalle ei löytynyt Metsäkeskuksen metsävaratietoa. Voit syöttää puuston perustiedot itse.';
export const API_ERROR_MESSAGE =
  'Metsävaratiedon hakeminen epäonnistui, koska Metsäkeskuksen rajapinta ei vastannut. Yritä hetken kuluttua uudelleen.';

// --- Prices -----------------------------------------------------------------

export async function getStumpagePrices(regionCode: string): Promise<StumpagePrices> {
  const cached = await pool.query<{ prices: StumpagePrices; fetched_at: Date }>(
    'SELECT prices, fetched_at FROM stumpage_price_cache WHERE region_code = $1',
    [regionCode]
  );
  const row = cached.rows[0];
  if (row && Date.now() - row.fetched_at.getTime() < PRICE_CACHE_HOURS * HOUR_MS) return row.prices;

  try {
    const prices = await fetchLukePrices(regionCode);
    if (prices) {
      await pool.query(
        `INSERT INTO stumpage_price_cache (region_code, prices, fetched_at) VALUES ($1, $2, NOW())
         ON CONFLICT (region_code) DO UPDATE SET prices = EXCLUDED.prices, fetched_at = EXCLUDED.fetched_at`,
        [regionCode, JSON.stringify(prices)]
      );
      return prices;
    }
  } catch (error) {
    console.warn('Luke price fetch failed:', error instanceof Error ? error.message : error);
  }
  // Old Luke prices are still better than the config fallback
  return row?.prices ?? fallbackPrices();
}

// --- Geometry helpers (PostGIS) ---------------------------------------------

interface Parcel {
  geometry3067: PolygonGeometry;
  areaHa: number;
  geometryHash: string;
  propertyCode: string | null;
}

async function loadParcel(propertyId: number, userId: number): Promise<Parcel | null> {
  const result = await pool.query(
    `SELECT ST_AsGeoJSON(ST_Transform(geometry, 3067))::json AS geometry3067,
            ST_Area(ST_Transform(geometry, 3067)) / 10000 AS area_ha,
            md5(ST_AsBinary(geometry)) AS geometry_hash,
            property_code
     FROM properties WHERE id = $1 AND user_id = $2`,
    [propertyId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    geometry3067: row.geometry3067,
    areaHa: Number(row.area_ha),
    geometryHash: row.geometry_hash,
    propertyCode: row.property_code,
  };
}

async function wgs84ToTm35(geometry: unknown): Promise<PolygonGeometry> {
  const result = await pool.query(
    'SELECT ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 3067))::json AS g',
    [JSON.stringify(geometry)]
  );
  return result.rows[0].g;
}

/** Convert stand geometries of a result from EPSG:3067 to WGS84 for the map. */
async function standGeometriesToWgs84(result: ForestValueResult): Promise<void> {
  const geometries = result.stands.map((s) => (s.geometry ? JSON.stringify(s.geometry) : null));
  if (geometries.every((g) => g === null)) return;
  const converted = await pool.query<{ ord: string; g: PolygonGeometry | null }>(
    `SELECT ord, CASE WHEN g IS NULL THEN NULL
              ELSE ST_AsGeoJSON(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(g), 3067), 4326), 6)::json END AS g
     FROM unnest($1::text[]) WITH ORDINALITY AS t(g, ord)`,
    [geometries]
  );
  for (const row of converted.rows) {
    result.stands[Number(row.ord) - 1].geometry = row.g;
  }
}

function bboxOf(geometry: PolygonGeometry): [number, number, number, number] {
  const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
  const xs = rings.flat().map((c) => c[0]);
  const ys = rings.flat().map((c) => c[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Municipality from the property code: "091-404-0001-0001" or 14-digit "09140400010001". */
function municipalityFromPropertyCode(code: string | null): string | null {
  if (!code) return null;
  const match = code.match(/^(\d{1,3})-/) ?? code.match(/^(\d{3})\d{11}$/);
  return match ? match[1].padStart(3, '0') : null;
}

// --- Pipeline ---------------------------------------------------------------

interface BuildInput {
  propertyId: number;
  parcel: PolygonGeometry;
  parcelAreaHa: number;
  stands: ForestStand[];
  provider: ForestDataProvider;
  municipality: string | null;
}

/** Clip, price and value stands. Returns null when no stand overlaps the parcel. */
export async function buildForestValue(input: BuildInput): Promise<ForestValueResult | null> {
  const clipped = clipStandsToParcel(input.parcel, input.stands);
  if (clipped.length === 0) return null;

  // Price area from the municipality covering most of the parcel
  let municipality = input.municipality;
  const byMunicipality = new Map<string, number>();
  for (const c of clipped) {
    const m = (c.stand as Partial<MetsakeskusStand>).municipalityNumber;
    if (m) byMunicipality.set(m, (byMunicipality.get(m) ?? 0) + c.areaHaInParcel);
  }
  if (byMunicipality.size > 0) {
    municipality = [...byMunicipality.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const prices = await getStumpagePrices(priceRegionForMunicipality(municipality));

  const currentYear = new Date().getFullYear();
  const result = computeForestValue({
    propertyId: input.propertyId,
    parcelAreaHa: input.parcelAreaHa,
    stands: clipped,
    prices,
    provider: input.provider,
    operations: recommendOperations(clipped, prices, currentYear),
    currentYear,
  });
  await standGeometriesToWgs84(result);
  return result;
}

async function readCache(propertyId: number) {
  const cached = await pool.query<{ geometry_hash: string; result: ForestValueResult; computed_at: Date; provider: string }>(
    'SELECT geometry_hash, result, computed_at, provider FROM forest_value_cache WHERE property_id = $1',
    [propertyId]
  );
  return cached.rows[0] ?? null;
}

async function writeCache(propertyId: number, geometryHash: string, result: ForestValueResult): Promise<void> {
  await pool.query(
    `INSERT INTO forest_value_cache (property_id, geometry_hash, provider, result, computed_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (property_id) DO UPDATE
       SET geometry_hash = EXCLUDED.geometry_hash, provider = EXCLUDED.provider,
           result = EXCLUDED.result, computed_at = EXCLUDED.computed_at`,
    [propertyId, geometryHash, result.data.provider, JSON.stringify(result)]
  );
}

function staleResponse(result: ForestValueResult): ForestValueResponse {
  return {
    status: 'available',
    stale: true,
    result: {
      ...result,
      warnings: [
        ...result.warnings.filter((w) => w.code !== 'stale_cache'),
        {
          code: 'stale_cache',
          message: `Metsäkeskuksen rajapinta ei vastannut. Näytetään aiemmin laskettu arvio (${new Date(
            result.computedAt
          ).toLocaleDateString('fi-FI')}).`,
        },
      ],
    },
  };
}

/**
 * Forest value for a user's property. Returns null if the property does not exist
 * or belongs to someone else.
 */
export async function getForestValue(
  propertyId: number,
  userId: number,
  options: { refresh?: boolean } = {}
): Promise<ForestValueResponse | null> {
  const parcel = await loadParcel(propertyId, userId);
  if (!parcel) return null;

  const mode = forestDataMode();
  const provider: ForestDataProvider = mode === 'mock' ? 'mock' : 'metsakeskus';
  const cached = await readCache(propertyId);
  const sameParcel = cached?.geometry_hash === parcel.geometryHash;
  const usableCache = sameParcel && cached?.provider === provider ? cached : null;

  if (
    usableCache &&
    !options.refresh &&
    Date.now() - usableCache.computed_at.getTime() < cacheHours() * HOUR_MS
  ) {
    return { status: 'available', stale: false, result: usableCache.result };
  }

  let stands: ForestStand[];
  try {
    stands =
      mode === 'mock'
        ? generateMockStands(parcel.geometry3067, propertyId)
        : await fetchStandsInBbox(bboxOf(parcel.geometry3067));
  } catch (error) {
    console.warn('Metsäkeskus fetch failed:', error instanceof Error ? error.message : error);
    if (usableCache) return staleResponse(usableCache.result);
    return { status: 'error', message: API_ERROR_MESSAGE };
  }

  const result = await buildForestValue({
    propertyId,
    parcel: parcel.geometry3067,
    parcelAreaHa: parcel.areaHa,
    stands,
    provider,
    municipality: municipalityFromPropertyCode(parcel.propertyCode),
  });
  if (!result) {
    // Owner-entered basics for this parcel, if given earlier
    if (sameParcel && cached?.provider === 'manual') {
      return { status: 'available', stale: false, result: cached.result };
    }
    return { status: 'no_data', message: NO_DATA_MESSAGE };
  }

  await writeCache(propertyId, parcel.geometryHash, result);
  return { status: 'available', stale: false, result };
}

/** Value from owner-entered basics; stored so it is shown again while there is no forest data. */
export async function getManualForestValue(
  propertyId: number,
  userId: number,
  input: ManualStandInput
): Promise<ForestValueResponse | null> {
  const parcel = await loadParcel(propertyId, userId);
  if (!parcel) return null;
  const result = await buildForestValue({
    propertyId,
    parcel: parcel.geometry3067,
    parcelAreaHa: parcel.areaHa,
    stands: [manualStand(parcel.geometry3067, parcel.areaHa, input, new Date().getFullYear())],
    provider: 'manual',
    municipality: municipalityFromPropertyCode(parcel.propertyCode),
  });
  if (!result) return { status: 'no_data', message: NO_DATA_MESSAGE };
  await writeCache(propertyId, parcel.geometryHash, result);
  return { status: 'available', stale: false, result };
}

// Guest demo: mock stands on the fixed demo parcel, cached in memory
let demoCache: { result: ForestValueResult; at: number } | null = null;

export async function getDemoForestValue(): Promise<ForestValueResponse> {
  if (demoCache && Date.now() - demoCache.at < cacheHours() * HOUR_MS) {
    return { status: 'available', stale: false, result: demoCache.result };
  }
  const parcel = await wgs84ToTm35(DEMO_PARCEL_WGS84);
  const result = await buildForestValue({
    propertyId: -1,
    parcel,
    parcelAreaHa: planarAreaHa(parcel),
    stands: generateMockStands(parcel, 0),
    provider: 'mock',
    municipality: null,
  });
  if (!result) return { status: 'no_data', message: NO_DATA_MESSAGE };
  demoCache = { result, at: Date.now() };
  return { status: 'available', stale: false, result };
}

// Guests may add their own parcel in the demo (kept only in the browser). Its value is
// computed from example stands like the demo parcel – never from the live Metsäkeskus API,
// so the public endpoint stays cheap. Size cap keeps generated stand counts reasonable.
export const MAX_GUEST_PARCEL_HA = 1000;

export class GuestParcelError extends Error {}

function seedFromGeometry(geometry: unknown): number {
  const text = JSON.stringify(geometry);
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (Math.imul(hash, 31) + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

export async function getGuestForestValue(
  geometryWgs84: unknown,
  propertyCode: string | null
): Promise<ForestValueResponse> {
  const type = (geometryWgs84 as { type?: unknown } | null)?.type;
  if (type !== 'Polygon' && type !== 'MultiPolygon') {
    throw new GuestParcelError('Palstan rajaus puuttuu tai on virheellinen');
  }
  let parcel: PolygonGeometry;
  try {
    parcel = await wgs84ToTm35(geometryWgs84);
  } catch {
    throw new GuestParcelError('Palstan rajaus on virheellinen');
  }
  const areaHa = planarAreaHa(parcel);
  if (!(areaHa > 0) || areaHa > MAX_GUEST_PARCEL_HA) {
    throw new GuestParcelError(`Demossa palstan koko voi olla enintään ${MAX_GUEST_PARCEL_HA} ha`);
  }

  const result = await buildForestValue({
    propertyId: -1,
    parcel,
    parcelAreaHa: areaHa,
    // Same parcel → same example stands on every request
    stands: generateMockStands(parcel, seedFromGeometry(geometryWgs84)),
    provider: 'mock',
    municipality: municipalityFromPropertyCode(propertyCode),
  });
  if (!result) return { status: 'no_data', message: NO_DATA_MESSAGE };
  return { status: 'available', stale: false, result };
}
