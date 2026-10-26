import { area as turfArea } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type CadastreSource = 'mml' | 'mock';

// Kiinteistötunnus: kunta (1–3) - kylä/rekisteriyksikkö (1–3) - tila (1–4) - yksikkö (1–4) digits,
// as MML shows it without leading zeros (e.g. 91-2-9901-100), or the 14-digit canonical form.
const DISPLAY_CODE_REGEX = /^(\d{1,3})-(\d{1,3})-(\d{1,4})-(\d{1,4})$/;
const CANONICAL_CODE_REGEX = /^(\d{3})(\d{3})(\d{4})(\d{4})$/;

const MML_FEATURES_BASE =
  'https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3/collections/PalstanSijaintitiedot/items';
// A property can have many parcels (palstat); OGC API Features returns only 10 by default
const MML_PARCEL_LIMIT = 100;
const MML_TIMEOUT_MS = 10_000;

interface ParsedPropertyCode {
  // MML "kiinteistotunnuksenEsitysmuoto", e.g. 91-2-9901-100
  display: string;
  // MML "kiinteistotunnus", 14 digits, e.g. 09100299010100
  canonical: string;
}

export function parsePropertyCode(raw: string): ParsedPropertyCode | null {
  // Spaces work as separators too: "145 414 5 187" and "145 - 414 - 5 - 187" -> 145-414-5-187
  const value = raw.trim().replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');
  const match = DISPLAY_CODE_REGEX.exec(value) ?? CANONICAL_CODE_REGEX.exec(value);
  if (!match) return null;
  const parts = match.slice(1, 5).map(Number);
  const widths = [3, 3, 4, 4];
  return {
    display: parts.join('-'),
    canonical: parts.map((part, i) => String(part).padStart(widths[i], '0')).join(''),
  };
}

/**
 * Thrown when the MML Cadastre API is not configured and the environment
 * is not development. Callers should map this to HTTP 503.
 */
export class CadastreApiNotConfiguredError extends Error {
  constructor() {
    super(
      'Kiinteistöhaku ei ole käytettävissä ilman MML API -asetuksia. ' +
      'Lisää MML_API_KEY ja MML_CADASTRE_API_URL backend/.env-tiedostoon.'
    );
    this.name = 'CadastreApiNotConfiguredError';
  }
}

/** Thrown when the MML service does not answer or answers with an error. Map to HTTP 503. */
export class CadastreUnavailableError extends Error {
  constructor() {
    super('Maanmittauslaitoksen kiinteistöpalvelu ei vastaa juuri nyt. Yritä hetken kuluttua uudelleen.');
    this.name = 'CadastreUnavailableError';
  }
}

type Position = [number, number];
type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

interface UnknownFeature {
  type: 'Feature';
  geometry: Geometry | null;
  properties?: Record<string, unknown> | null;
}

export interface CadastreFeatureProperties {
  propertyCode: string;
  name: string;
  areaHa?: number;
  // Number of separate parcels (palstat) the property consists of
  parcelCount?: number;
  source: CadastreSource;
}

export interface CadastreFeature {
  type: 'Feature';
  geometry: Geometry;
  properties: CadastreFeatureProperties;
}

function isFeature(value: unknown): value is UnknownFeature {
  if (!value || typeof value !== 'object') return false;
  const item = value as { type?: unknown; geometry?: unknown };
  return item.type === 'Feature' && !!item.geometry;
}

function isFeatureCollection(value: unknown): value is { type: 'FeatureCollection'; features: unknown[] } {
  if (!value || typeof value !== 'object') return false;
  const item = value as { type?: unknown; features?: unknown };
  return item.type === 'FeatureCollection' && Array.isArray(item.features);
}

function geodesicAreaHa(geometry: Polygon | MultiPolygon): number {
  const feature: Feature<Polygon | MultiPolygon> = { type: 'Feature', geometry, properties: {} };
  return Math.round((turfArea(feature) / 10_000) * 100) / 100;
}

/**
 * Combine MML parcel features (PalstanSijaintitiedot: one feature per palsta) into one property.
 * One parcel stays a Polygon; several become a MultiPolygon. The area is computed from the
 * merged geometry so it always covers every parcel. Returns null when there is no polygon.
 */
export function mergeCadastreFeatures(data: unknown, propertyCode: string): CadastreFeature | null {
  const features: UnknownFeature[] = isFeatureCollection(data)
    ? data.features.filter(isFeature)
    : isFeature(data)
      ? [data]
      : [];

  const polygons: Position[][][] = [];
  for (const feature of features) {
    const geometry = feature.geometry;
    if (geometry?.type === 'Polygon') polygons.push(geometry.coordinates);
    else if (geometry?.type === 'MultiPolygon') polygons.push(...geometry.coordinates);
  }
  if (polygons.length === 0) return null;

  const geometry: Polygon | MultiPolygon =
    polygons.length === 1
      ? { type: 'Polygon', coordinates: polygons[0] }
      : { type: 'MultiPolygon', coordinates: polygons };

  const displayCode = features
    .map((f) => f.properties?.kiinteistotunnuksenEsitysmuoto)
    .find((value): value is string => typeof value === 'string');

  return {
    type: 'Feature',
    geometry: geometry as Geometry,
    properties: {
      propertyCode,
      name: displayCode ?? `Kiinteistö ${propertyCode}`,
      areaHa: geodesicAreaHa(geometry),
      parcelCount: polygons.length,
      source: 'mml',
    },
  };
}

function createMockFeature(propertyCode: string): CadastreFeature {
  const numbers = propertyCode.replace(/-/g, '').split('').map((n) => Number(n));
  const hash = numbers.reduce((acc, n, idx) => acc + n * (idx + 3), 0);

  const centerLat = 61 + (hash % 80) / 10;
  const centerLng = 20 + (hash % 100) / 10;
  const halfSize = 0.01;

  const polygon: Geometry = {
    type: 'Polygon',
    coordinates: [[
      [centerLng - halfSize, centerLat - halfSize],
      [centerLng + halfSize, centerLat - halfSize],
      [centerLng + halfSize, centerLat + halfSize],
      [centerLng - halfSize, centerLat + halfSize],
      [centerLng - halfSize, centerLat - halfSize],
    ]],
  };

  return {
    type: 'Feature',
    geometry: polygon,
    properties: {
      propertyCode,
      name: `Kiinteisto ${propertyCode}`,
      areaHa: 4,
      parcelCount: 1,
      source: 'mock',
    },
  };
}

export function isValidPropertyCode(value: string): boolean {
  return typeof value === 'string' && parsePropertyCode(value) !== null;
}

/** GET JSON from MML. Returns null for 404; throws CadastreUnavailableError when MML is unreachable or fails. */
async function fetchMmlJson(url: string, apiKey: string): Promise<unknown | null> {
  const safeUrl = url.replace(apiKey, '***');
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/geo+json' },
      signal: AbortSignal.timeout(MML_TIMEOUT_MS),
    });
  } catch (error) {
    console.error(`[cadastre] MML did not respond: ${safeUrl}`, error instanceof Error ? error.message : error);
    throw new CadastreUnavailableError();
  }

  const responseText = await response.text();
  if (response.status === 404) return null;
  if (!response.ok) {
    console.error(`[cadastre] MML API error ${response.status} for ${safeUrl}\n  Response body: ${responseText.slice(0, 500)}`);
    throw new CadastreUnavailableError();
  }
  try {
    return JSON.parse(responseText);
  } catch {
    console.error(`[cadastre] Non-JSON response from MML: ${responseText.slice(0, 200)}`);
    throw new CadastreUnavailableError();
  }
}

/** Build the MML query URL for every parcel of one property from MML_CADASTRE_API_URL. */
function propertyQueryUrl(urlTemplate: string, canonicalCode: string, apiKey: string): string {
  const encodedCode = encodeURIComponent(canonicalCode);
  // Use ?api-key= URL param – Basic auth causes HTTP 500 with Node.js undici/HTTP2
  let url = urlTemplate
    .replace('{propertyCode}', encodedCode)
    .replace(/[?&]api-key=[^&]*/i, '') // remove existing api-key param if any
    .replace(/&&/, '&')
    .replace(/\?&/, '?');

  const add = (param: string) => {
    url = `${url}${url.includes('?') ? '&' : '?'}${param}`;
  };
  if (!url.includes(encodedCode)) add(`kiinteistotunnus=${encodedCode}`);
  if (!/[?&]limit=/i.test(url)) add(`limit=${MML_PARCEL_LIMIT}`);
  add(`api-key=${encodeURIComponent(apiKey)}`);
  return url;
}

/** Whole property (all parcels) by kiinteistötunnus. Null when the code is invalid or not found. */
export async function searchCadastreByPropertyCode(propertyCodeRaw: string): Promise<CadastreFeature | null> {
  const parsed = parsePropertyCode(propertyCodeRaw);
  if (!parsed) {
    return null;
  }
  const propertyCode = parsed.display;

  const apiKey = process.env.MML_API_KEY;
  const urlTemplate = process.env.MML_CADASTRE_API_URL;

  if (!apiKey || !urlTemplate) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[cadastre] MML API not configured – returning mock geometry (development only).\n' +
        'Set MML_API_KEY and MML_CADASTRE_API_URL in backend/.env to use real data.'
      );
      return createMockFeature(propertyCode);
    }
    throw new CadastreApiNotConfiguredError();
  }

  const url = propertyQueryUrl(urlTemplate, parsed.canonical, apiKey);
  console.log(`[cadastre] Querying MML: ${url.replace(apiKey, '***')} (input: ${propertyCode})`);

  const data = await fetchMmlJson(url, apiKey);
  if (data === null) {
    console.log(`[cadastre] Property not found: ${propertyCode}`);
    return null;
  }
  return mergeCadastreFeatures(data, propertyCode);
}

/**
 * Property at the given WGS84 coordinates. Finds the clicked parcel, then loads the whole
 * property by its kiinteistötunnus so that every parcel is included.
 * Returns null if nothing is found or MML is not configured.
 */
export async function searchCadastreByCoordinates(
  lat: number,
  lng: number
): Promise<CadastreFeature | null> {
  const apiKey = process.env.MML_API_KEY;
  if (!apiKey) {
    return null; // Coordinate search is silently unavailable without API key
  }

  // Small bbox (~15 m radius) around the clicked point.
  // CRS84 uses lon/lat axis order: bbox=minLon,minLat,maxLon,maxLat
  const delta = 0.00015;
  const bboxStr = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  // Same collection as the property query (MML_CADASTRE_API_URL without its query string)
  const base = process.env.MML_CADASTRE_API_URL?.split('?')[0] || MML_FEATURES_BASE;
  const url = `${base}?bbox=${bboxStr}&limit=1&api-key=${encodeURIComponent(apiKey)}`;

  const data = await fetchMmlJson(url, apiKey);
  if (!isFeatureCollection(data)) return null;
  const clicked = data.features.find(isFeature);
  if (!clicked) return null;

  const props = clicked.properties ?? {};
  const code =
    typeof props.kiinteistotunnuksenEsitysmuoto === 'string'
      ? props.kiinteistotunnuksenEsitysmuoto
      : typeof props.kiinteistotunnus === 'string'
        ? props.kiinteistotunnus
        : null;
  const parsed = code ? parsePropertyCode(code) : null;
  const displayCode = parsed?.display ?? code ?? 'Tuntematon';

  // Whole property; fall back to the clicked parcel if the property query fails.
  // Without a configured property query URL the code search would return mock data, so skip it.
  if (parsed && process.env.MML_CADASTRE_API_URL) {
    try {
      const whole = await searchCadastreByPropertyCode(parsed.canonical);
      if (whole) return whole;
    } catch (error) {
      console.warn('[cadastre] Loading all parcels failed, using the clicked parcel only:', error);
    }
  }
  return mergeCadastreFeatures(clicked, displayCode);
}
