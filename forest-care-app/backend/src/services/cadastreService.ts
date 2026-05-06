export type CadastreSource = 'mml' | 'mock';

const PROPERTY_CODE_REGEX = /^\d{3}-\d{3}-\d{2}-\d{1,4}$/;

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

type Position = [number, number];
type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] }
  | { type: 'MultiPolygon'; coordinates: Position[][][] };

interface UnknownFeature {
  type: 'Feature';
  geometry: Geometry;
  properties?: Record<string, unknown>;
}

interface UnknownFeatureCollection {
  type: 'FeatureCollection';
  features: UnknownFeature[];
}

export interface CadastreFeatureProperties {
  propertyCode: string;
  name: string;
  areaHa?: number;
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

function isFeatureCollection(value: unknown): value is UnknownFeatureCollection {
  if (!value || typeof value !== 'object') return false;
  const item = value as { type?: unknown; features?: unknown };
  return item.type === 'FeatureCollection' && Array.isArray(item.features);
}

function normalizeMmlResponse(data: unknown, propertyCode: string): CadastreFeature | null {
  const withProps = (geometry: Geometry, sourceName?: string, areaHa?: number): CadastreFeature => ({
    type: 'Feature',
    geometry,
    properties: {
      propertyCode,
      name: sourceName || `Kiinteisto ${propertyCode}`,
      areaHa,
      source: 'mml',
    },
  });

  if (isFeature(data)) {
    const areaCandidate = (data.properties as { areaHa?: unknown; area_ha?: unknown; area?: unknown } | null)?.areaHa
      ?? (data.properties as { areaHa?: unknown; area_ha?: unknown; area?: unknown } | null)?.area_ha
      ?? (data.properties as { areaHa?: unknown; area_ha?: unknown; area?: unknown } | null)?.area;
    const nameCandidate = (data.properties as { name?: unknown; propertyName?: unknown } | null)?.name
      ?? (data.properties as { name?: unknown; propertyName?: unknown } | null)?.propertyName;
    return withProps(
      data.geometry as Geometry,
      typeof nameCandidate === 'string' ? nameCandidate : undefined,
      typeof areaCandidate === 'number' ? areaCandidate : undefined
    );
  }

  if (isFeatureCollection(data) && data.features.length > 0) {
    const first = data.features[0];
    if (!first.geometry) return null;
    type MmlProps = {
      areaHa?: unknown; area_ha?: unknown; area?: unknown;
      name?: unknown; propertyName?: unknown;
      kiinteistotunnuksenEsitysmuoto?: unknown;
    };
    const props = first.properties as MmlProps | null;
    const areaCandidate = props?.areaHa ?? props?.area_ha ?? props?.area;
    const nameCandidate =
      props?.kiinteistotunnuksenEsitysmuoto ?? props?.name ?? props?.propertyName;
    return withProps(
      first.geometry as Geometry,
      typeof nameCandidate === 'string' ? nameCandidate : undefined,
      typeof areaCandidate === 'number' ? areaCandidate : undefined
    );
  }

  if (data && typeof data === 'object') {
    const maybe = data as {
      geometry?: Geometry;
      name?: unknown;
      propertyName?: unknown;
      areaHa?: unknown;
      area_ha?: unknown;
      area?: unknown;
    };
    if (maybe.geometry) {
      return withProps(
        maybe.geometry,
        typeof maybe.name === 'string'
          ? maybe.name
          : typeof maybe.propertyName === 'string'
            ? maybe.propertyName
            : undefined,
        typeof maybe.areaHa === 'number'
          ? maybe.areaHa
          : typeof maybe.area_ha === 'number'
            ? maybe.area_ha
            : typeof maybe.area === 'number'
              ? maybe.area
              : undefined
      );
    }
  }

  return null;
}

function normalizePropertyCode(propertyCode: string): string {
  return propertyCode.trim();
}

function toCanonicalPropertyCode(propertyCode: string): string {
  const [kunta, ryhma, yksikko, tunnus] = propertyCode.split('-');
  return `${kunta}${ryhma}${yksikko.padStart(4, '0')}${tunnus.padStart(4, '0')}`;
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
      source: 'mock',
    },
  };
}

export function isValidPropertyCode(value: string): boolean {
  return PROPERTY_CODE_REGEX.test(value.trim());
}

export async function searchCadastreByPropertyCode(propertyCodeRaw: string): Promise<CadastreFeature | null> {
  const propertyCode = normalizePropertyCode(propertyCodeRaw);

  if (!isValidPropertyCode(propertyCode)) {
    return null;
  }

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

  const canonicalPropertyCode = toCanonicalPropertyCode(propertyCode);
  const encodedCanonicalCode = encodeURIComponent(canonicalPropertyCode);
  // Build URL from template – strip any api-key param already in the template
  // avoin-paikkatieto.maanmittauslaitos.fi requires Basic auth (api-key as username),
  // NOT the ?api-key= URL parameter (that causes HTTP 500 on the items endpoint).
  let targetUrl = urlTemplate
    .replace('{propertyCode}', encodedCanonicalCode)
    .replace(/[?&]api-key=[^&]*/i, '')  // remove ?api-key= if present in template
    .replace(/&&/, '&')                  // clean up double &&
    .replace(/\?&/, '?');               // clean up ?& edge case

  if (!targetUrl.includes(encodedCanonicalCode)) {
    const glue = targetUrl.includes('?') ? '&' : '?';
    targetUrl = `${targetUrl}${glue}kiinteistotunnus=${encodedCanonicalCode}`;
  }

  console.log(`[cadastre] Querying MML: ${targetUrl} (input: ${propertyCode}, canonical: ${canonicalPropertyCode})`);

  // avoin-paikkatieto uses Basic auth: api-key as username, empty password
  const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');
  const response = await fetch(targetUrl, {
    headers: {
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
  });

  const responseText = await response.text();

  if (response.status === 404) {
    console.log(`[cadastre] Property not found: ${propertyCode}`);
    return null;
  }

  if (!response.ok) {
    console.error(
      `[cadastre] MML API error ${response.status} for ${targetUrl}\n` +
      `  Input: ${propertyCode}, canonical: ${canonicalPropertyCode}\n` +
      `  Response body: ${responseText.slice(0, 500)}`
    );
    throw new Error(`MML request failed with status ${response.status}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error(`[cadastre] Non-JSON response from MML: ${responseText.slice(0, 200)}`);
    throw new Error('MML returned non-JSON response');
  }

  return normalizeMmlResponse(data, propertyCode);
}

/**
 * Search for a property (palsta) at the given WGS84 coordinates.
 * Uses MML OGC API Features with a small bounding box around the click point.
 * Returns null if no property is found or MML is not configured.
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
  // avoin-paikkatieto.maanmittauslaitos.fi requires Basic auth (api-key as username).
  // Do NOT append api-key as URL param – that causes HTTP 500 on the items endpoint.
  const url =
    `https://avoin-paikkatieto.maanmittauslaitos.fi/kiinteisto-avoin/simple-features/v3` +
    `/collections/PalstanSijaintitiedot/items` +
    `?bbox=${bboxStr}&limit=1`;

  const basicAuth = Buffer.from(`${apiKey}:`).toString('base64');

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${basicAuth}`,
      },
    });
  } catch (err) {
    console.error('[cadastre] Coordinate search network error:', err);
    return null;
  }

  if (!response.ok) return null;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  if (!isFeatureCollection(data) || data.features.length === 0) return null;

  const first = data.features[0];
  if (!first.geometry) return null;

  type MmlProps = { kiinteistotunnus?: unknown; kiinteistotunnuksenEsitysmuoto?: unknown };
  const props = first.properties as MmlProps | null;
  const displayCode =
    typeof props?.kiinteistotunnuksenEsitysmuoto === 'string'
      ? props.kiinteistotunnuksenEsitysmuoto
      : typeof props?.kiinteistotunnus === 'string'
        ? props.kiinteistotunnus
        : 'Tuntematon';

  return {
    type: 'Feature',
    geometry: first.geometry as Geometry,
    properties: {
      propertyCode: displayCode,
      name: `Kiinteistö ${displayCode}`,
      source: 'mml',
    },
  };
}
