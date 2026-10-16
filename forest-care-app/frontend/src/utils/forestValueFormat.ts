import type {
  DevelopmentClass,
  MarkingType,
  ForestValueResult,
  OperationTiming,
  OperationType,
  PriceCutType,
  TimberAssortment,
  TreeSpecies,
} from '../types';

// Finnish labels and number formatting for the forest value feature

export const SPECIES_LABEL: Record<TreeSpecies, string> = {
  pine: 'Mänty',
  spruce: 'Kuusi',
  birch: 'Koivu',
  other_deciduous: 'Muut lehtipuut',
};

export const SPECIES_ORDER: TreeSpecies[] = ['pine', 'spruce', 'birch', 'other_deciduous'];

export const DEVELOPMENT_CLASS_LABEL: Record<DevelopmentClass, string> = {
  A0: 'Aukea',
  S0: 'Siemenpuumetsikkö',
  T1: 'Taimikko alle 1,3 m',
  T2: 'Taimikko yli 1,3 m',
  Y1: 'Ylispuustoinen taimikko',
  '02': 'Nuori kasvatusmetsikkö',
  '03': 'Varttunut kasvatusmetsikkö',
  '04': 'Uudistuskypsä metsikkö',
  '05': 'Suojuspuumetsikkö',
  ER: 'Eri-ikäisrakenteinen',
};

export const OPERATION_LABEL: Record<OperationType, string> = {
  young_stand_management: 'Taimikonhoito',
  brush_clearing: 'Vesakonhoito',
  first_thinning: 'Ensiharvennus',
  thinning: 'Harvennushakkuu',
  clear_cut: 'Uudistushakkuu (avohakkuu)',
  selection_cut: 'Poimintahakkuu',
  seed_tree_cut: 'Siemenpuuhakkuu',
  overstory_removal: 'Ylispuiden poisto',
  soil_preparation: 'Maanmuokkaus',
  planting: 'Istutus',
};

export const TIMING_LABEL: Record<OperationTiming, string> = {
  now: 'Nyt',
  '1-3y': '1–3 v',
  '3-5y': '3–5 v',
  '5-10y': '5–10 v',
  '10y+': 'Yli 10 v',
};

export const TIMING_ORDER: OperationTiming[] = ['now', '1-3y', '3-5y', '5-10y', '10y+'];

export const ASSORTMENT_LABEL: Record<TimberAssortment, string> = {
  pine_log: 'Mäntytukki',
  spruce_log: 'Kuusitukki',
  birch_log: 'Koivutukki',
  pine_pulp: 'Mäntykuitu',
  spruce_pulp: 'Kuusikuitu',
  birch_pulp: 'Koivukuitu',
};

export const ASSORTMENT_ORDER: TimberAssortment[] = [
  'pine_log',
  'spruce_log',
  'birch_log',
  'pine_pulp',
  'spruce_pulp',
  'birch_pulp',
];

export const PRICE_CUT_TYPE_LABEL: Record<PriceCutType, string> = {
  regeneration: 'uudistushakkuun hinnoin',
  thinning: 'harvennushakkuun hinnoin',
  first_thinning: 'ensiharvennuksen hinnoin',
};

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('fi-FI', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatEur(value: number): string {
  return `${formatNumber(Math.round(value))} €`;
}

export function formatEurRange(low: number, high: number): string {
  return `${formatNumber(low)}–${formatNumber(high)} €`;
}

export function formatHa(value: number): string {
  return `${formatNumber(value, value < 10 ? 2 : 1)} ha`;
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

/** "Metsävaratieto 2024", "Metsävaratieto 2019–2024", "Esimerkkidata" … */
export function dataSourceLabel(result: ForestValueResult): string {
  const { provider, inventoryYearMin, inventoryYearMax } = result.data;
  if (provider === 'mock') return 'Esimerkkidata (ei oikeaa metsävaratietoa)';
  if (provider === 'manual') return 'Omat tiedot';
  if (inventoryYearMin === null) return 'Metsävaratieto';
  return inventoryYearMin === inventoryYearMax
    ? `Metsävaratieto ${inventoryYearMin}`
    : `Metsävaratieto ${inventoryYearMin}–${inventoryYearMax}`;
}

// Work request type when the owner asks for offers on a recommended operation
export const OPERATION_WORK_TYPE: Record<OperationType, MarkingType> = {
  young_stand_management: 'vesakonhoito',
  brush_clearing: 'vesakonhoito',
  first_thinning: 'harvennus',
  thinning: 'harvennus',
  selection_cut: 'harvennus',
  clear_cut: 'avohakkuu',
  seed_tree_cut: 'avohakkuu',
  overstory_removal: 'avohakkuu',
  soil_preparation: 'muu_tyo',
  planting: 'istutus',
};

export function standTitle(standNumber: string | null): string {
  return standNumber ? `Kuvio ${standNumber}` : 'Kuvio';
}
