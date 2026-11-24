/**
 * Fields (pellot) on a parcel. Fields are not forest: they get no timber value and no
 * forest management recommendations, even when the stand data (or mock data) covers them.
 *
 * Two sources:
 *  - Ruokavirasto's field parcel register (peltolohkorekisteri, LPIS), open WFS data
 *  - the owner's own "Tämä on pelto" marks on stands (forest_field_marks)
 *
 * All geometries are in ETRS-TM35FIN (EPSG:3067), like the rest of the pipeline.
 */
import { difference, featureCollection, intersect, multiPolygon, polygon } from '@turf/turf';
import type { Feature, MultiPolygon, Polygon } from 'geojson';
import { MIN_CLIPPED_AREA_HA, planarAreaHa, type ClippedStand } from './clip';
import { fetchJson } from './metsakeskusClient';
import type { FieldArea, PolygonGeometry } from './types';

/** A field parcel from the register, EPSG:3067. */
export interface RegisterField {
  /** Peruslohkotunnus */
  id: string;
  geometry: PolygonGeometry;
}

function toFeature(geometry: PolygonGeometry): Feature<Polygon | MultiPolygon> {
  return geometry.type === 'Polygon' ? polygon(geometry.coordinates) : multiPolygon(geometry.coordinates);
}

function safeIntersect(a: PolygonGeometry, b: PolygonGeometry): PolygonGeometry | null {
  try {
    return (intersect(featureCollection([toFeature(a), toFeature(b)]))?.geometry as PolygonGeometry) ?? null;
  } catch {
    return null;
  }
}

/** a minus every geometry in others; null when (almost) nothing is left. */
function subtractAll(a: PolygonGeometry, others: PolygonGeometry[]): PolygonGeometry | null {
  let rest: PolygonGeometry | null = a;
  for (const other of others) {
    if (!rest) break;
    try {
      rest = (difference(featureCollection([toFeature(rest), toFeature(other)]))?.geometry as PolygonGeometry) ?? null;
    } catch {
      // Invalid source geometry: keep the stand as it is rather than lose it
    }
  }
  return rest && planarAreaHa(rest) >= MIN_CLIPPED_AREA_HA ? rest : null;
}

export interface SeparatedFields {
  stands: ClippedStand[];
  fields: FieldArea[];
}

/**
 * Remove fields from the clipped stands. Register fields are cut out of every stand; stands the
 * owner marked as field are removed whole. A stand that is (almost) all field disappears.
 */
export function separateFields(
  parcel: PolygonGeometry,
  stands: ClippedStand[],
  registerFields: RegisterField[],
  userFieldStandIds: ReadonlySet<string>
): SeparatedFields {
  const fields: FieldArea[] = [];
  const registerInParcel: PolygonGeometry[] = [];

  for (const field of registerFields) {
    const geometry = safeIntersect(parcel, field.geometry);
    if (!geometry) continue;
    const areaHa = planarAreaHa(geometry);
    if (areaHa < MIN_CLIPPED_AREA_HA) continue;
    registerInParcel.push(geometry);
    fields.push({ source: 'register', fieldId: field.id, standId: null, standNumber: null, geometry, areaHa });
  }

  const forest: ClippedStand[] = [];
  for (const clipped of stands) {
    const rest = registerInParcel.length > 0 ? subtractAll(clipped.geometry, registerInParcel) : clipped.geometry;
    if (!rest) continue;
    const areaHa = rest === clipped.geometry ? clipped.areaHaInParcel : planarAreaHa(rest);
    if (userFieldStandIds.has(clipped.stand.id)) {
      // Only the part not already in the register, so field area is not counted twice
      fields.push({
        source: 'owner',
        fieldId: null,
        standId: clipped.stand.id,
        standNumber: clipped.stand.standNumber,
        geometry: rest,
        areaHa,
      });
      continue;
    }
    forest.push(rest === clipped.geometry ? clipped : { ...clipped, geometry: rest, areaHaInParcel: areaHa });
  }

  return { stands: forest, fields };
}

// --- Ruokavirasto field parcel register (WFS) -------------------------------

const DEFAULT_FIELD_WFS_URL = 'https://inspire.ruokavirasto-awsa.com/geoserver/wfs';
// One layer per year; update the default when Ruokavirasto publishes a new year
const DEFAULT_FIELD_WFS_TYPENAME = 'inspire:LC.LandCoverSurfaces.LPIS.2025';
const PAGE_SIZE = 1000;
const MAX_PAGES = 3;

/** FIELD_DATA_MODE=off skips the register (offline development, tests). */
export function fieldDataEnabled(): boolean {
  return process.env.FIELD_DATA_MODE !== 'off';
}

interface FieldFeature {
  geometry?: PolygonGeometry | null;
  properties?: { PERUSLOHKOTUNNUS?: string | number | null; TUNNUS?: string | number | null } | null;
}

export function mapFieldFeature(feature: FieldFeature): RegisterField | null {
  const geometry = feature.geometry;
  if (!geometry || (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon')) return null;
  const id = feature.properties?.PERUSLOHKOTUNNUS ?? feature.properties?.TUNNUS;
  return { id: id != null ? String(id) : 'pelto', geometry };
}

/** Field parcels intersecting a bounding box (EPSG:3067). Callers clip them to the parcel. */
export async function fetchFieldsInBbox(bbox: [number, number, number, number]): Promise<RegisterField[]> {
  const baseUrl = process.env.FIELD_WFS_URL || DEFAULT_FIELD_WFS_URL;
  const typeName = process.env.FIELD_WFS_TYPENAME || DEFAULT_FIELD_WFS_TYPENAME;
  const fields: RegisterField[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      srsName: 'EPSG:3067',
      bbox: `${bbox.join(',')},EPSG:3067`,
      count: String(PAGE_SIZE),
      startIndex: String(page * PAGE_SIZE),
    });
    const body = (await fetchJson(`${baseUrl}?${params}`)) as { features?: FieldFeature[] };
    const features = body.features ?? [];
    for (const feature of features) {
      const field = mapFieldFeature(feature);
      if (field) fields.push(field);
    }
    if (features.length < PAGE_SIZE) break;
  }
  return fields;
}
