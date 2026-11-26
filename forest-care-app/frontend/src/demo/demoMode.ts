import type { User } from '../types';

// Guest demo ("Kokeile demoa"): the app runs as a logged-in forest owner on example data that
// lives only in this browser tab. API calls are answered by demoBackend instead of the server.

const GUEST_KEY = 'guest';

export const DEMO_USER: User = { id: 900001, email: 'demo@metsuri.fi' };

/** True while a guest is using the demo (a real login always wins) */
export function isDemoActive(): boolean {
  try {
    return !localStorage.getItem('token') && sessionStorage.getItem(GUEST_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setDemoActive(active: boolean): void {
  try {
    if (active) sessionStorage.setItem(GUEST_KEY, 'true');
    else sessionStorage.removeItem(GUEST_KEY);
  } catch {
    // Storage blocked: the demo then lasts until the page is reloaded
  }
}
