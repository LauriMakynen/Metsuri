import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { forestValueService, propertiesService } from '../services/forestService';
import type { ForestValueResponse, Property } from '../types';
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

async function load(key: string, propertyId: number, force: boolean) {
  const current = entries.get(key);
  if (current?.status === 'loading') return;
  if (!force && current?.status === 'ready' && Date.now() - current.fetchedAt < FRESH_MS) return;

  setEntry(key, { status: 'loading', response: current?.response ?? null, fetchedAt: current?.fetchedAt ?? 0 });
  try {
    const response =
      propertyId === DEMO_PROPERTY_ID
        ? await forestValueService.getDemo()
        : await propertiesService.getForestValue(propertyId, force);
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
    if (key && propertyId !== null) void load(key, propertyId, false);
  }, [key, propertyId]);

  // force = also bypass the server cache
  const reload = useCallback(
    (force = true) => {
      if (key && propertyId !== null) void load(key, propertyId, force);
    },
    [key, propertyId]
  );

  return { entry, reload };
}
