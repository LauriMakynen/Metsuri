/**
 * Is the work area of a new work request really forest? Forest work (thinning, planting…)
 * on a field or in a built-up area is almost always a mistake, so the owner is asked to
 * confirm before such a request is published.
 *
 * Sources, like for the forest value: Ruokavirasto's field parcel register and
 * Metsäkeskus's open stand data (stands exist only on forest land).
 */
import pool from '../db/pool';
import { fetchFieldsInBbox, fieldDataEnabled } from './forestValue/fields';
import { fetchStandsInBbox } from './forestValue/metsakeskusClient';
import type { PolygonGeometry } from './forestValue/types';

// Work that only makes sense in a forest; 'muu_tyo' (roads, culverts…) is not checked
export const FOREST_WORK_TYPES = ['vesakonhoito', 'istutus', 'harvennus', 'avohakkuu'];

// Open Metsäkeskus stand data, used even when the value calculation runs on example data
const DEFAULT_STAND_WFS_URL = 'https://avoin.metsakeskus.fi/rajapinnat/v2/stand/ows';
// A point request is treated as a small circle around the point
const POINT_RADIUS_M = 15;
export const FIELD_SHARE_LIMIT = 0.5;
export const FOREST_SHARE_LIMIT = 0.3;

/** Share (0–1) of the work area that is field / forest; null when the source could not be checked. */
export interface WorkAreaLand {
  fieldShare: number | null;
  forestShare: number | null;
}

/** Message for the owner when the area does not look like forest, otherwise null. */
export function workAreaWarning(type: string, land: WorkAreaLand): string | null {
  if (!FOREST_WORK_TYPES.includes(type)) return null;
  if (land.fieldShare !== null && land.fieldShare >= FIELD_SHARE_LIMIT) {
    return 'Työn alue on Ruokaviraston peltolohkorekisterin mukaan peltoa. Metsätöitä ei yleensä tehdä pellolle.';
  }
  if (land.forestShare !== null && land.forestShare < FOREST_SHARE_LIMIT) {
    return (
      'Työn alueella ei ole metsää Metsäkeskuksen metsävaratiedon mukaan – se voi olla esimerkiksi ' +
      'rakennettua aluetta, tietä tai vesistöä. Tarkista alue kartalta.'
    );
  }
  return null;
}

export function landCheckEnabled(): boolean {
  return process.env.LAND_CHECK_MODE !== 'off';
}

async function coveredShare(area: PolygonGeometry, covers: PolygonGeometry[]): Promise<number> {
  if (covers.length === 0) return 0;
  const result = await pool.query<{ share: number | null }>(
    `WITH a AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 3067)) g),
          c AS (SELECT ST_UnaryUnion(ST_Collect(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x), 3067)))) g
                FROM unnest($2::text[]) AS x)
     SELECT ST_Area(ST_Intersection(a.g, c.g)) / NULLIF(ST_Area(a.g), 0) AS share FROM a, c`,
    [JSON.stringify(area), covers.map((g) => JSON.stringify(g))]
  );
  return Number(result.rows[0]?.share ?? 0);
}

/** Field and forest shares of a work area given in WGS84 (polygon or point). */
export async function checkWorkArea(geometryWgs84: unknown): Promise<WorkAreaLand> {
  const converted = await pool.query<{ g: PolygonGeometry; x1: number; y1: number; x2: number; y2: number }>(
    `WITH g AS (
       SELECT CASE WHEN GeometryType(geom) = 'POINT' THEN ST_Buffer(geom, $2) ELSE geom END AS g
       FROM (SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 3067) AS geom) t
     )
     SELECT ST_AsGeoJSON(g)::json AS g, ST_XMin(g) x1, ST_YMin(g) y1, ST_XMax(g) x2, ST_YMax(g) y2 FROM g`,
    [JSON.stringify(geometryWgs84), POINT_RADIUS_M]
  );
  const { g: area, x1, y1, x2, y2 } = converted.rows[0];
  const bbox: [number, number, number, number] = [x1, y1, x2, y2];

  const [fields, stands] = await Promise.all([
    fieldDataEnabled() ? fetchFieldsInBbox(bbox).catch(() => null) : Promise.resolve(null),
    fetchStandsInBbox(bbox, process.env.METSAKESKUS_WFS_URL || DEFAULT_STAND_WFS_URL).catch(() => null),
  ]);

  return {
    fieldShare: fields ? await coveredShare(area, fields.map((f) => f.geometry)) : null,
    forestShare: stands
      ? await coveredShare(area, stands.flatMap((s) => (s.geometry ? [s.geometry] : [])))
      : null,
  };
}
