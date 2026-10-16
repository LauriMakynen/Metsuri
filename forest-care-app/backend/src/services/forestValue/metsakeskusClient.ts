/**
 * Suomen metsäkeskus open forest resource data (metsävarakuviot), WFS 2.0.
 *
 * Endpoint: METSAKESKUS_WFS_URL, e.g. https://avoin.metsakeskus.fi/rajapinnat/v2/stand/ows
 * Layer:    METSAKESKUS_WFS_TYPENAME, default v2:stand
 *
 * Verified 2026-10 against GetCapabilities / DescribeFeatureType and the data
 * model sheet "Metsävara- ja elinympäristökuviot 2.1.3" (sheet "MV GeoServer").
 * The v1 interface is retired at the end of June 2027.
 *
 * Field meanings (v2:stand):
 *  - volume, sawlogvolume, pulpwoodvolume: m³/ha (stand level, no tree strata)
 *  - proportionpine / proportionspruce / proportionother: volume shares, 0–1
 *  - measurementdate: inventory date; treestanddatadate: date the (growth-updated) figures describe
 *  - cuttingtype + cuttingproposalyear: periodic (jaksollinen) cutting proposal, code list hakkuutapa-v_1_0
 *  - cuttingtype_ccs + cuttingproposalyear_ccs: continuous cover (jatkuva kasvatus) proposal
 *  - silviculturetype: grouped silviculture proposal, 1–6 (see SILVICULTURE_TYPE)
 * Code lists: https://koodistot.suomi.fi, registry "metsarek".
 */
import type {
  DevelopmentClass,
  ForestStand,
  OperationType,
  PolygonGeometry,
  ProposedOperation,
  StandStratum,
  TreeSpecies,
} from './types';
import { DEVELOPMENT_CLASSES } from './types';

export interface StandFeatureProperties {
  standid: number;
  municipalitynumber?: string | null;
  standnumber?: number | null;
  standnumberextension?: string | null;
  maingroup?: string | null;
  subgroup?: string | null;
  fertilityclass?: string | null;
  soiltype?: string | null;
  developmentclass?: string | null;
  area?: number | null;
  measurementdate?: string | null;
  treestanddatadate?: string | null;
  maintreespecies?: string | null;
  proportionpine?: number | null;
  proportionspruce?: number | null;
  proportionother?: number | null;
  meanage?: number | null;
  basalarea?: number | null;
  stemcount?: number | null;
  meandiameter?: number | null;
  meanheight?: number | null;
  volume?: number | null;
  sawlogvolume?: number | null;
  pulpwoodvolume?: number | null;
  cuttingtype?: string | null;
  cuttingproposalyear?: number | null;
  cuttingtype_ccs?: string | null;
  cuttingproposalyear_ccs?: number | null;
  silviculturetype?: string | null;
  silvicultureproposalyear?: number | null;
}

export interface StandFeature {
  type: 'Feature';
  id?: string;
  geometry: PolygonGeometry | null;
  properties: StandFeatureProperties;
}

export interface MetsakeskusStand extends ForestStand {
  municipalityNumber: string | null;
}

// paapuulaji-v_1_0
const SPECIES_BY_CODE: Record<string, TreeSpecies> = {
  '1': 'pine',
  '2': 'spruce',
  '3': 'birch', // rauduskoivu
  '4': 'birch', // hieskoivu
  '27': 'birch', // visakoivu
  '5': 'other_deciduous', // haapa
  '6': 'other_deciduous', // harmaaleppä
  '7': 'other_deciduous', // tervaleppä
  '9': 'other_deciduous', // muu lehtipuu
  '13': 'other_deciduous',
  '15': 'other_deciduous',
  '17': 'other_deciduous',
  '18': 'other_deciduous',
  '20': 'other_deciduous',
  '21': 'other_deciduous',
  '24': 'other_deciduous',
  '25': 'other_deciduous',
  '26': 'other_deciduous',
  '28': 'other_deciduous',
  // 29 "Lehtipuu" (generic deciduous): in Finnish forests mostly birch
  '29': 'birch',
};
// Generic or rare conifers (8 muu havupuu, 10 douglaskuusi, …, 30 havupuu): pine or spruce by volume shares
const CONIFER_CODES = new Set(['8', '10', '11', '12', '14', '16', '19', '22', '23', '30']);

// hakkuutapa-v_1_0. 0 (määräaikainen lepo) and 9 (erikoishakkuu) are not shown as operations.
const CUTTING_TYPE: Record<string, OperationType> = {
  '1': 'overstory_removal', // ylispuiden poisto
  '2': 'first_thinning',
  '3': 'thinning',
  '4': 'clear_cut', // kaistalehakkuu
  '5': 'clear_cut', // avohakkuu
  '6': 'clear_cut', // verhopuuhakkuu
  '7': 'seed_tree_cut', // suojuspuuhakkuu
  '8': 'seed_tree_cut',
  '11': 'thinning', // yläharvennus
  '12': 'thinning', // väljennyshakkuu
  '13': 'thinning', // kunnostushakkuu
  '14': 'selection_cut', // poimintahakkuu
  '15': 'clear_cut', // pienaukkohakkuu
};

// Grouped metsanhoitotyon_tyolaji-v_1_1 as published in the WFS layer
const SILVICULTURE_TYPE: Record<string, OperationType> = {
  '1': 'planting', // taimikon perustaminen
  '2': 'brush_clearing', // hakkuualan raivaus
  '3': 'planting', // taimikon täydennys
  '4': 'young_stand_management', // taimikonhoito
  '5': 'young_stand_management', // nuoren metsän hoito
  // 6 muu metsänhoito: too unspecific to show
};

const PEAT_SOIL_TYPES = new Set(['60', '61', '62', '63', '64', '65', '66', '67']);

function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const year = Number.parseInt(date.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function mainSpeciesOf(p: StandFeatureProperties): TreeSpecies | null {
  const code = p.maintreespecies ?? null;
  if (code && SPECIES_BY_CODE[code]) return SPECIES_BY_CODE[code];
  if (code && CONIFER_CODES.has(code)) {
    return (p.proportionspruce ?? 0) > (p.proportionpine ?? 0) ? 'spruce' : 'pine';
  }
  return null;
}

/**
 * Build per-species strata from stand-level totals.
 *
 * Assumption: the WFS gives only pine / spruce / other shares, so "other" is
 * valued as birch (birch is by far the most common deciduous tree in Finland),
 * and sawlog/pulpwood are split by the same shares.
 */
function strataOf(p: StandFeatureProperties): StandStratum[] {
  const volume = num(p.volume) ?? 0;
  if (volume <= 0) return [];
  const sawlog = num(p.sawlogvolume);
  const pulp = num(p.pulpwoodvolume);
  const shares: [TreeSpecies, number][] = [
    ['pine', num(p.proportionpine) ?? 0],
    ['spruce', num(p.proportionspruce) ?? 0],
    ['birch', num(p.proportionother) ?? 0],
  ];
  const total = shares.reduce((sum, [, share]) => sum + share, 0);
  if (total <= 0) {
    // No shares: put everything on the main species
    const species = mainSpeciesOf(p) ?? 'pine';
    shares.splice(0, shares.length, [species, 1]);
  }
  const norm = total > 0 ? total : 1;

  return shares
    .filter(([, share]) => share > 0)
    .map(([species, share]) => {
      const f = share / norm;
      return {
        species,
        volumeM3PerHa: volume * f,
        sawlogM3PerHa: sawlog !== null ? sawlog * f : null,
        pulpwoodM3PerHa: pulp !== null ? pulp * f : null,
        meanAgeYears: num(p.meanage),
        stemsPerHa: null,
        basalAreaM2PerHa: null,
        meanHeightM: num(p.meanheight),
        meanDiameterCm: num(p.meandiameter),
      };
    });
}

function proposalsOf(p: StandFeatureProperties): ProposedOperation[] {
  const proposals: ProposedOperation[] = [];
  // Continuous cover proposal only when there is no periodic one, to avoid two conflicting cuts
  const cutting = p.cuttingtype
    ? { type: CUTTING_TYPE[p.cuttingtype], year: num(p.cuttingproposalyear) }
    : p.cuttingtype_ccs
      ? { type: CUTTING_TYPE[p.cuttingtype_ccs], year: num(p.cuttingproposalyear_ccs) }
      : null;
  if (cutting?.type) proposals.push({ type: cutting.type, year: cutting.year });

  const silviculture = p.silviculturetype ? SILVICULTURE_TYPE[p.silviculturetype] : undefined;
  if (silviculture) proposals.push({ type: silviculture, year: num(p.silvicultureproposalyear) });
  return proposals;
}

export function mapStandFeature(feature: StandFeature): MetsakeskusStand | null {
  if (!feature.geometry) return null;
  const p = feature.properties;
  const devClass = (p.developmentclass ?? null) as DevelopmentClass | null;
  const standNumber =
    p.standnumber !== null && p.standnumber !== undefined
      ? `${p.standnumber}${p.standnumberextension ? `.${p.standnumberextension}` : ''}`
      : null;

  return {
    id: String(p.standid ?? feature.id),
    standNumber,
    geometry: feature.geometry,
    areaHa: num(p.area) ?? 0,
    developmentClass: devClass && DEVELOPMENT_CLASSES.includes(devClass) ? devClass : null,
    mainSpecies: mainSpeciesOf(p),
    meanAgeYears: num(p.meanage),
    stemsPerHa: num(p.stemcount),
    basalAreaM2PerHa: num(p.basalarea),
    fertilityClass: num(p.fertilityclass),
    soilType:
      (p.soiltype && PEAT_SOIL_TYPES.has(p.soiltype)) || ['2', '3', '4', '5'].includes(p.subgroup ?? '')
        ? 'peatland'
        : p.soiltype || p.subgroup
          ? 'mineral'
          : null,
    // paaryhma-v_1_0: 1 metsämaa. Kitumaa and joutomaa produce no merchantable timber.
    isForestLand: p.maingroup === '1',
    strata: strataOf(p),
    inventoryYear: yearOf(p.measurementdate) ?? yearOf(p.treestanddatadate),
    proposedOperations: proposalsOf(p),
    municipalityNumber: p.municipalitynumber ?? null,
  };
}

export class ExternalApiError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ExternalApiError';
  }
}

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const TIMEOUT_MS = 20_000;

export async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new ExternalApiError(`${url.split('?')[0]} responded ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error instanceof ExternalApiError) throw error;
    throw new ExternalApiError(`Request to ${url.split('?')[0]} failed`, error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch all stands intersecting a bounding box (EPSG:3067).
 * The bbox filter is coarse; callers clip the stands to the parcel.
 */
export async function fetchStandsInBbox(bbox: [number, number, number, number]): Promise<MetsakeskusStand[]> {
  const baseUrl = process.env.METSAKESKUS_WFS_URL;
  if (!baseUrl) throw new ExternalApiError('METSAKESKUS_WFS_URL is not set');
  const typeName = process.env.METSAKESKUS_WFS_TYPENAME || 'v2:stand';

  const stands: MetsakeskusStand[] = [];
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
    const body = (await fetchJson(`${baseUrl}?${params}`)) as { features?: StandFeature[] };
    const features = body.features ?? [];
    for (const feature of features) {
      const stand = mapStandFeature(feature);
      if (stand) stands.push(stand);
    }
    if (features.length < PAGE_SIZE) break;
  }
  return stands;
}
