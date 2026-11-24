import type { Marking, MarkingType } from '../types';

// Shared colors and labels for forest management marking types
export const MARKING_COLORS: Record<MarkingType, string> = {
  vesakonhoito: '#f59e0b',
  istutus: '#10b981',
  harvennus: '#3b82f6',
  avohakkuu: '#ef4444',
  muu_tyo: '#8b5cf6',
};

export const MARKING_TYPE_LABELS: Record<MarkingType, string> = {
  vesakonhoito: 'Vesakonhoito',
  istutus: 'Istutus',
  harvennus: 'Harvennus',
  avohakkuu: 'Avohakkuu',
  muu_tyo: 'Muu työ',
};

export const MARKING_TYPES = Object.keys(MARKING_TYPE_LABELS) as MarkingType[];

// Notes ("Muistio" tool) are the owner's own reminders, not done work: own sidebar section and map color
export const NOTE_COLOR = '#ec4899';
export const NOTE_LABEL = 'Muistiinpano';

export function isNote(marking: Pick<Marking, 'geometry_type'>): boolean {
  return marking.geometry_type === 'note';
}
