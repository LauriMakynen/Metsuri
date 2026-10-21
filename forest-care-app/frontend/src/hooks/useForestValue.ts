import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { forestValueService, propertiesService } from '../services/forestService';
import type { ForestValueResponse, ManualStandInput, Property } from '../types';
import { DEMO_PROPERTY_ID } from '../utils/demoData';

// In-memory cache of forest value results, shared by the value card and the
// detail view so that opening the view or reselecting a parcel does not refetch.
// The server caches results for 24 h as well; this only avoids repeated requests
// within one session.

export interface ForestValueEntry {
  status: 'loading' | 'ready' | 'failed';
  // Kept while reloading, so the previous result stays visible
  response: ForestValueResponse | null;
  fetchedAt: number;
}

const FRESH_MS = 10 * 60 * 1000;
const entries = new Map<string, ForestValueEntry>();
const listeners = new Set<() => void>();

function setEntry(key: string, entry: ForestValueEntry) {
  entries.set(key, entry);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Geometry edits bump updated_at, which gives the parcel a new cache key
function cacheKey(property: Property): string {
  return `${property.id}:${property.updated_at ?? property.created_at}`;
}

// Guest-added parcels have negative ids and exist only in the browser
function isGuestParcel(propertyId: number): boolean {
  return propertyId < 0 && propertyId !== DEMO_PROPERTY_ID;
}

async function load(key: string, property: Property, force: boolean) {
  const current = entries.get(key);
  if (current?.status === 'loading') return;
  if (!force && current?.status === 'ready' && Date.now() - current.fetchedAt < FRESH_MS) return;

  setEntry(key, { status: 'loading', response: current?.response ?? null, fetchedAt: current?.fetchedAt ?? 0 });
  try {
    const response =
      property.id === DEMO_PROPERTY_ID
        ? await forestValueService.getDemo()
        : isGuestParcel(property.id)
          ? await forestValueService.getGuest(property.geometry, property.property_code ?? null)
          : await propertiesService.getForestValue(property.id, force);
    setEntry(key, { status: 'ready', response, fetchedAt: Date.now() });
  } catch {
    setEntry(key, { status: 'failed', response: current?.response ?? null, fetchedAt: Date.now() });
  }
}

export function useForestValue(property: Property | null) {
  const key = property ? cacheKey(property) : null;
  const propertyId = property?.id ?? null;
  const entry = useSyncExternalStore(subscribe, () => (key ? entries.get(key) : undefined));

  useEffect(() => {
    if (key && property) void load(key, property, false);
  }, [key, property]);

  // force = also bypass the server cache
  const reload = useCallback(
    (force = true) => {
      if (key && property) void load(key, property, force);
    },
    [key, property]
  );

  // Throws on failure so the form can show the server's message
  const submitManual = useCallback(
    async (input: ManualStandInput) => {
      if (!key || propertyId === null) return;
      if (propertyId < 0) {
        // Shape of an axios error, so the form shows this message like a server error
        throw { response: { data: { error: 'Kirjaudu sisään, niin voit syöttää palstan tiedot itse.' } } };
      }
      const response = await propertiesService.submitManualForestValue(propertyId, input);
      setEntry(key, { status: 'ready', response, fetchedAt: Date.now() });
    },
    [key, propertyId]
  );

  return { entry, reload, submitManual };
}
