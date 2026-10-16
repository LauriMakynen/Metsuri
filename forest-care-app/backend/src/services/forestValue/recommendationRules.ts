/**
 * Silvicultural recommendation rules.
 *
 * Simplified from the principles of Tapio's "Metsänhoidon suositukset"
 * (Hyvän metsänhoidon suositukset), southern/central Finland mineral soils.
 * The real recommendations depend on site type, region (temperature sum) and
 * thinning models with height-basal area curves; these rules approximate them
 * with a few thresholds so that an owner gets a sensible "what next" list.
 * They are not a forest management plan.
 *
 * To tune: change THRESHOLDS, or edit / reorder RULES. Rules are evaluated in
 * order and the first matching rule gives the stand's main operation; its
 * followUps are added after it.
 */
import type { DevelopmentClass, OperationTiming, OperationType, PriceCutType, TreeSpecies } from './types';

export const THRESHOLDS = {
  /** Stems/ha after young stand management (taimikonhoito), Tapio target levels. */
  youngStandTargetStems: { pine: 2000, spruce: 1800, birch: 1600, other_deciduous: 1600 } as Record<TreeSpecies, number>,
  /** Management is due when density exceeds the target by this factor. */
  youngStandOverDensityFactor: 1.3,
  /** Mean height (m) at which a young stand is ready for first thinning. */
  firstThinningHeightM: 12,
  /** If height is unknown: age at which first thinning is typically due. */
  firstThinningAge: { pine: 30, spruce: 30, birch: 22, other_deciduous: 22 } as Record<TreeSpecies, number>,
  /** Basal area (m²/ha) above which a maturing stand should be thinned (harvennusraja, simplified). */
  thinningBasalArea: { pine: 23, spruce: 26, birch: 20, other_deciduous: 20 } as Record<TreeSpecies, number>,
  /** If basal area is unknown: volume (m³/ha) above which thinning is likely due. */
  thinningVolumeM3PerHa: 170,
  /** Regeneration age (uudistuskypsyysikä) on medium sites in southern Finland. */
  regenerationAge: { pine: 80, spruce: 70, birch: 60, other_deciduous: 50 } as Record<TreeSpecies, number>,
  /** Uneven-aged stand: selection cut when basal area exceeds this. */
  selectionCutBasalArea: 20,
};

/** Share of standing volume removed, used to estimate harvest removal and income. */
export const REMOVAL_SHARE: Partial<Record<OperationType, number>> = {
  first_thinning: 0.35,
  thinning: 0.3,
  selection_cut: 0.3,
  // Retention trees (säästöpuut) are left standing
  clear_cut: 0.95,
  seed_tree_cut: 0.85,
};

export const PRICE_CUT_TYPE: Partial<Record<OperationType, PriceCutType>> = {
  first_thinning: 'first_thinning',
  thinning: 'thinning',
  selection_cut: 'thinning',
  clear_cut: 'regeneration',
  seed_tree_cut: 'regeneration',
};

export interface StandContext {
  developmentClass: DevelopmentClass | null;
  species: TreeSpecies;
  ageYears: number | null;
  stemsPerHa: number | null;
  basalAreaM2PerHa: number | null;
  meanHeightM: number | null;
  volumeM3PerHa: number;
  fertilityClass: number | null;
}

export interface FollowUp {
  operation: OperationType;
  delayYears: number;
  reason: string;
}

export interface RecommendationRule {
  id: string;
  operation: OperationType;
  when: (s: StandContext) => boolean;
  timing: (s: StandContext) => OperationTiming;
  reason: (s: StandContext) => string;
  followUps?: FollowUp[];
}

const SPECIES_GENITIVE: Record<TreeSpecies, string> = {
  pine: 'männyllä',
  spruce: 'kuusella',
  birch: 'koivulla',
  other_deciduous: 'lehtipuilla',
};

const fmt = (n: number) => Math.round(n).toLocaleString('fi-FI');

const REGENERATION_FOLLOW_UPS: FollowUp[] = [
  {
    operation: 'soil_preparation',
    delayYears: 1,
    reason: 'Uudistushakkuun jälkeen maanmuokkaus parantaa taimien kasvuunlähtöä.',
  },
  {
    operation: 'planting',
    delayYears: 1,
    reason: 'Istutus tai kylvö muokkauksen jälkeen. Metsälaki edellyttää uudistamista hakkuun jälkeen.',
  },
];

export const RULES: RecommendationRule[] = [
  {
    id: 'open-area-regeneration',
    operation: 'soil_preparation',
    when: (s) => s.developmentClass === 'A0',
    timing: () => 'now',
    reason: () => 'Aukea uudistusala: maanmuokkaus ja istutus kannattaa tehdä pian hakkuun jälkeen.',
    followUps: [{ operation: 'planting', delayYears: 0, reason: 'Istuta tai kylvä muokattu ala.' }],
  },
  {
    id: 'small-seedlings-early-care',
    operation: 'brush_clearing',
    when: (s) => s.developmentClass === 'T1',
    timing: () => '1-3y',
    reason: () =>
      'Pieni taimikko: varhaishoito eli heinän ja vesakon raivaus taimien ympäriltä turvaa taimien kasvun.',
  },
  {
    id: 'overstory-removal',
    operation: 'young_stand_management',
    when: (s) => s.developmentClass === 'Y1',
    timing: () => 'now',
    reason: () => 'Ylispuustoinen taimikko: ylispuut kannattaa poistaa, jotta ne eivät vahingoita taimikkoa.',
  },
  {
    id: 'dense-young-stand',
    operation: 'young_stand_management',
    when: (s) =>
      s.developmentClass === 'T2' &&
      s.stemsPerHa !== null &&
      s.stemsPerHa > THRESHOLDS.youngStandTargetStems[s.species] * THRESHOLDS.youngStandOverDensityFactor,
    timing: () => 'now',
    reason: (s) =>
      `Taimikko on tiheä (${fmt(s.stemsPerHa as number)} runkoa/ha). Suositeltu tiheys ${SPECIES_GENITIVE[s.species]} ` +
      `taimikonhoidon jälkeen on noin ${fmt(THRESHOLDS.youngStandTargetStems[s.species])} runkoa/ha.`,
  },
  {
    id: 'young-stand-check',
    operation: 'young_stand_management',
    when: (s) => s.developmentClass === 'T2',
    timing: () => '1-3y',
    reason: () =>
      'Taimikko: tarkista tiheys ja lehtipuuvesakko. Taimikonhoito tehdään tyypillisesti 3–7 metrin pituudessa.',
  },
  {
    id: 'first-thinning',
    operation: 'first_thinning',
    when: (s) => s.developmentClass === '02',
    timing: (s) => {
      if (s.meanHeightM !== null) {
        if (s.meanHeightM >= THRESHOLDS.firstThinningHeightM) return 'now';
        if (s.meanHeightM >= THRESHOLDS.firstThinningHeightM - 2) return '1-3y';
        return '3-5y';
      }
      const age = THRESHOLDS.firstThinningAge[s.species];
      if (s.ageYears === null) return '3-5y';
      if (s.ageYears >= age) return '1-3y';
      if (s.ageYears >= age - 5) return '3-5y';
      return '5-10y';
    },
    reason: (s) =>
      s.meanHeightM !== null
        ? `Nuori kasvatusmetsikkö, keskipituus ${s.meanHeightM.toFixed(0)} m. Ensiharvennus tehdään yleensä ` +
          `${THRESHOLDS.firstThinningHeightM}–16 metrin pituudessa.`
        : `Nuori kasvatusmetsikkö (${s.ageYears ?? '?'} v). Ensiharvennus tehdään yleensä puuston ollessa 12–16 m pitkää.`,
  },
  {
    id: 'mature-stand-regeneration-soon',
    operation: 'clear_cut',
    // A maturing stand near regeneration age is not thinned any more
    when: (s) =>
      s.developmentClass === '03' &&
      s.ageYears !== null &&
      s.ageYears >= THRESHOLDS.regenerationAge[s.species] - 10,
    timing: () => '5-10y',
    reason: (s) =>
      `Varttunut metsikkö lähestyy uudistuskypsyyttä (${s.ageYears} v, ${SPECIES_GENITIVE[s.species]} ` +
      `uudistusikä noin ${THRESHOLDS.regenerationAge[s.species]} v). Harvennus ei tässä vaiheessa yleensä enää kannata.`,
    followUps: REGENERATION_FOLLOW_UPS,
  },
  {
    id: 'thinning',
    operation: 'thinning',
    when: (s) => s.developmentClass === '03',
    timing: (s) => {
      const limit = THRESHOLDS.thinningBasalArea[s.species];
      if (s.basalAreaM2PerHa !== null) {
        if (s.basalAreaM2PerHa >= limit) return 'now';
        if (s.basalAreaM2PerHa >= limit - 3) return '1-3y';
        return '5-10y';
      }
      return s.volumeM3PerHa >= THRESHOLDS.thinningVolumeM3PerHa ? '1-3y' : '5-10y';
    },
    reason: (s) =>
      s.basalAreaM2PerHa !== null
        ? `Varttunut kasvatusmetsikkö, pohjapinta-ala ${s.basalAreaM2PerHa.toFixed(0)} m²/ha. Harvennus on ajankohtainen ` +
          `${SPECIES_GENITIVE[s.species]} noin ${THRESHOLDS.thinningBasalArea[s.species]} m²/ha kohdalla.`
        : `Varttunut kasvatusmetsikkö, puustoa ${fmt(s.volumeM3PerHa)} m³/ha. Harvennus lisää jäävien puiden kasvua.`,
  },
  {
    id: 'regeneration-cut',
    operation: 'clear_cut',
    when: (s) => s.developmentClass === '04' || s.developmentClass === 'S0',
    timing: (s) =>
      s.ageYears === null || s.ageYears >= THRESHOLDS.regenerationAge[s.species] ? 'now' : '1-3y',
    reason: (s) =>
      `Uudistuskypsä metsikkö (${s.ageYears ?? '?'} v). ` +
      (s.species === 'pine' && (s.fertilityClass ?? 0) >= 4
        ? 'Kuivahkolla kankaalla männikön voi uudistaa myös siemenpuuhakkuulla.'
        : 'Uudistushakkuu ja uuden puusukupolven perustaminen.'),
    followUps: REGENERATION_FOLLOW_UPS,
  },
  {
    id: 'uneven-aged-selection-cut',
    operation: 'selection_cut',
    when: (s) => s.developmentClass === 'ER',
    timing: (s) =>
      s.basalAreaM2PerHa !== null && s.basalAreaM2PerHa >= THRESHOLDS.selectionCutBasalArea ? '1-3y' : '5-10y',
    reason: () =>
      'Eri-ikäisrakenteinen metsikkö: poimintahakkuulla korjataan suurimpia puita ja säilytetään jatkuva peitteisyys.',
  },
];

/** Plain-language reason for a Metsäkeskus proposal that has no rule match. */
export const SOURCE_PROPOSAL_REASON = 'Metsäkeskuksen metsävaratiedon toimenpide-ehdotus.';
