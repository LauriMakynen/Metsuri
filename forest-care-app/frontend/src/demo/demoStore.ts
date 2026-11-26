import type {
  GeoJSONGeometry,
  ManualStandInput,
  Marking,
  MarkingType,
  Notification,
  Pricing,
} from '../types';
import type { ForumCategory } from '../services/forumService';
import { createDemoSeed } from './demoSeed';

// Rows of the demo's in-browser "database". Shapes follow the backend tables, so the demo
// handlers can answer exactly like the real API.

export interface DemoUser {
  id: number;
  email: string;
  /** Nickname shown in chats and on the forum */
  name: string | null;
}

export interface DemoProperty {
  id: number;
  user_id: number;
  name: string;
  property_code: string | null;
  source: string;
  area_ha: number | null;
  geometry: GeoJSONGeometry;
  /** Region (maakunta) for work requests on this parcel */
  region_code: string | null;
  /** "Tämä on pelto" marks and owner-entered basics, sent along when the value is computed */
  field_stand_ids: string[];
  manual: ManualStandInput | null;
  created_at: string;
  updated_at: string;
}

export type DemoMarking = Marking & { user_id: number };

export interface DemoWorkRequest {
  id: number;
  user_id: number;
  property_id: number | null;
  type: MarkingType;
  title: string;
  geometry: GeoJSONGeometry;
  area_ha: number | null;
  note: string | null;
  pricing: Pricing;
  target_price_eur: number;
  status: 'open' | 'closed';
  region_code: string | null;
  /** Boundary of the property the work is on, shown to work providers */
  property_geometry: GeoJSONGeometry;
  property_area_ha: number | null;
  created_at: string;
  updated_at: string;
}

export interface DemoPhoto {
  id: number;
  work_request_id: number;
  /** Image address: a bundled example photo or an object URL of an uploaded one */
  url: string;
  taken_at: string | null;
  created_at: string;
}

export interface DemoBid {
  id: number;
  work_request_id: number;
  user_id: number;
  amount_eur: number;
  status: 'pending' | 'accepted' | 'withdrawn';
  created_at: string;
}

export interface DemoChat {
  id: number;
  work_request_id: number;
  owner_id: number;
  provider_id: number;
  bid_id: number | null;
  owner_deleted: boolean;
  provider_deleted: boolean;
  created_at: string;
  /** The simulated other party has already answered once */
  auto_replied?: boolean;
}

export interface DemoMessage {
  id: number;
  chat_id: number;
  sender_id: number;
  body: string | null;
  image_base64: string | null;
  image_type: string | null;
  counter_offer_eur: number | null;
  counter_offer_status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | null;
  created_at: string;
  read_at: string | null;
}

export type DemoNotification = Notification;

export interface DemoForumThread {
  id: number;
  user_id: number;
  title: string;
  category: ForumCategory;
  created_at: string;
}

export interface DemoForumPost {
  id: number;
  thread_id: number;
  user_id: number;
  author_name: string;
  body: string;
  created_at: string;
  reported: boolean;
}

export interface DemoState {
  version: number;
  nextId: number;
  users: DemoUser[];
  properties: DemoProperty[];
  markings: DemoMarking[];
  workRequests: DemoWorkRequest[];
  photos: DemoPhoto[];
  bids: DemoBid[];
  chats: DemoChat[];
  messages: DemoMessage[];
  notifications: DemoNotification[];
  forumThreads: DemoForumThread[];
  forumPosts: DemoForumPost[];
}

// Bump when the seed changes shape, so an old tab starts over with fresh demo data
export const DEMO_STATE_VERSION = 1;
const STORAGE_KEY = 'metsuri-demo-state';

let state: DemoState | null = null;

function load(): DemoState {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as DemoState;
      if (parsed.version === DEMO_STATE_VERSION) return parsed;
    }
  } catch {
    // Unreadable or blocked storage: start from the seed
  }
  return { ...createDemoSeed(new Date()), version: DEMO_STATE_VERSION };
}

/** The demo data of this tab, created from the seed on first use */
export function demoState(): DemoState {
  if (!state) state = load();
  return state;
}

/** Keep changes over a page reload (same tab only); a full storage just loses them on reload */
export function saveDemoState(): void {
  if (!state) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded (e.g. many chat images): the data still lives in memory
  }
}

/** Start the demo over from the example data */
export function resetDemoState(): void {
  state = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore blocked storage
  }
}

export function nextDemoId(): number {
  const s = demoState();
  s.nextId += 1;
  return s.nextId;
}
