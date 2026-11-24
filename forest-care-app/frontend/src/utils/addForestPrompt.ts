import { propertiesService } from '../services/forestService';

// After login an owner without parcels is asked to add one. Skipping is remembered per user
// on this device; the "Minun metsäni" page keeps offering the same form.
const SKIP_KEY_PREFIX = 'metsuri.addForestSkipped.';

export function markAddForestSkipped(userId: number): void {
  try {
    localStorage.setItem(SKIP_KEY_PREFIX + userId, '1');
  } catch {
    // Storage unavailable (private mode): the prompt is just shown again next time
  }
}

function wasAddForestSkipped(userId: number): boolean {
  try {
    return localStorage.getItem(SKIP_KEY_PREFIX + userId) === '1';
  } catch {
    return false;
  }
}

/** Where to go after login: the "add your forest" step for owners with no parcels yet. */
export async function pathAfterLogin(userId: number): Promise<string> {
  if (wasAddForestSkipped(userId)) return '/start';
  try {
    const properties = await propertiesService.getAll();
    return properties.length === 0 ? '/lisaa-metsa' : '/start';
  } catch {
    return '/start';
  }
}
