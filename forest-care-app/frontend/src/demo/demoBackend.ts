import axios from 'axios';
import { pointOnFeature } from '@turf/turf';
import type {
  ChatSummary,
  ForestValueHistoryResponse,
  ForestValueResponse,
  GeoJSONGeometry,
  MarkingType,
  PublicWorkRequest,
  WorkRequest,
} from '../types';
import type {
  ForumMe,
  ForumPost,
  ForumStats,
  ForumThread,
  ForumThreadSummary,
} from '../services/forumService';
import { getFollowUpRecommendation } from '../utils/followUpRecommendation';
import { calculateAreaHa } from '../utils/measurement';
import { parcelProximity } from '../utils/distance';
import { DEMO_USER } from './demoMode';
import {
  demoState,
  nextDemoId,
  saveDemoState,
  type DemoBid,
  type DemoChat,
  type DemoMarking,
  type DemoMessage,
  type DemoNotification,
  type DemoProperty,
  type DemoWorkRequest,
} from './demoStore';

// The demo's stand-in for the backend: answers the same requests with the same shapes and rules
// (validation, best offer, chats, notifications), using the in-browser demo data. Forest value and
// cadastre lookups still go to the server's public guest endpoints.

export class DemoHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface DemoRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}

export interface DemoResponse {
  status?: number;
  data?: unknown;
}

type Handler = (req: DemoRequest) => DemoResponse | Promise<DemoResponse>;

const ME = DEMO_USER.id;
const MAX_EUR = 10_000_000;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTE_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 4000;
const BOUNDARY_TOLERANCE_KM = 0.025;
const PRESENCE_TIMEOUT_MS = 30_000;
const VALID_TYPES: MarkingType[] = ['vesakonhoito', 'istutus', 'harvennus', 'avohakkuu', 'muu_tyo'];
const VALID_GEOMETRY_TYPES = ['point', 'line', 'area', 'note'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Same as MAX_PHOTOS_PER_REQUEST in utils/photos (not imported: it would make an import cycle via the API client)
const MAX_PHOTOS_PER_REQUEST = 10;

const REGIONS: { code: string; name: string }[] = [
  { code: '21', name: 'Ahvenanmaa' }, { code: '09', name: 'Etelä-Karjala' }, { code: '14', name: 'Etelä-Pohjanmaa' },
  { code: '10', name: 'Etelä-Savo' }, { code: '18', name: 'Kainuu' }, { code: '05', name: 'Kanta-Häme' },
  { code: '16', name: 'Keski-Pohjanmaa' }, { code: '13', name: 'Keski-Suomi' }, { code: '08', name: 'Kymenlaakso' },
  { code: '19', name: 'Lappi' }, { code: '06', name: 'Pirkanmaa' }, { code: '15', name: 'Pohjanmaa' },
  { code: '12', name: 'Pohjois-Karjala' }, { code: '17', name: 'Pohjois-Pohjanmaa' }, { code: '11', name: 'Pohjois-Savo' },
  { code: '07', name: 'Päijät-Häme' }, { code: '04', name: 'Satakunta' }, { code: '01', name: 'Uusimaa' },
  { code: '02', name: 'Varsinais-Suomi' },
];

const nowIso = () => new Date().toISOString();
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const formatEur = (n: number) => n.toLocaleString('fi-FI', { maximumFractionDigits: 2 });
const isValidEur = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_EUR;
const byNewest = <T extends { created_at: string; id: number }>(a: T, b: T) =>
  b.created_at.localeCompare(a.created_at) || b.id - a.id;

function body(req: DemoRequest): Record<string, unknown> {
  return req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
}

function idParam(req: DemoRequest, name = 'id'): number {
  const value = req.params[name];
  if (!/^\d+$/.test(value ?? '')) throw new DemoHttpError(400, 'Invalid id');
  return Number(value);
}

function userName(userId: number): string | null {
  return demoState().users.find((u) => u.id === userId)?.name ?? null;
}

function userEmail(userId: number): string {
  return demoState().users.find((u) => u.id === userId)?.email ?? '';
}

function notify(n: Omit<DemoNotification, 'id' | 'read_at' | 'created_at'>): void {
  demoState().notifications.push({ ...n, id: nextDemoId(), read_at: null, created_at: nowIso() });
}

// --- Properties and markings ------------------------------------------------------------------

function ownProperty(id: number): DemoProperty {
  const property = demoState().properties.find((p) => p.id === id && p.user_id === ME);
  if (!property) throw new DemoHttpError(404, 'Property not found');
  return property;
}

function propertyOut(p: DemoProperty) {
  return {
    id: p.id, name: p.name, property_code: p.property_code, source: p.source, area_ha: p.area_ha,
    geometry: p.geometry, created_at: p.created_at, updated_at: p.updated_at,
  };
}

function markingOut(m: DemoMarking) {
  return { ...m };
}

function isAreaGeometry(geometry: unknown): geometry is GeoJSONGeometry {
  const type = (geometry as { type?: unknown } | null)?.type;
  return type === 'Polygon' || type === 'MultiPolygon';
}

function areaHa(geometry: GeoJSONGeometry): number | null {
  const ha = calculateAreaHa(geometry);
  return ha === null ? null : round2(ha);
}

function removePropertyRows(propertyId: number): void {
  const s = demoState();
  const requestIds = new Set(s.workRequests.filter((r) => r.property_id === propertyId).map((r) => r.id));
  requestIds.forEach(removeWorkRequestRows);
  s.markings.forEach((m) => {
    if (m.property_id === propertyId) m.property_id = null;
  });
  s.properties = s.properties.filter((p) => p.id !== propertyId);
}

// Forest value comes from the server's guest endpoints; the demo sends the parcel along
const guestApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});
const valueCache = new Map<string, Promise<ForestValueResponse>>();

function valueBody(p: DemoProperty) {
  return {
    geometry: p.geometry,
    property_code: p.property_code,
    field_stand_ids: p.field_stand_ids,
    manual: p.manual,
  };
}

function forestValue(p: DemoProperty, refresh = false): Promise<ForestValueResponse> {
  const key = JSON.stringify(valueBody(p));
  let cached = refresh ? undefined : valueCache.get(key);
  if (!cached) {
    cached = guestApi.post<ForestValueResponse>('/api/forest-value/guest', valueBody(p)).then((r) => r.data);
    // A failed request is tried again next time
    cached.catch(() => valueCache.delete(key));
    valueCache.set(key, cached);
  }
  return cached;
}

async function forestValueHistory(p: DemoProperty): Promise<ForestValueHistoryResponse> {
  const events = demoState()
    .markings.filter((m) => m.property_id === p.id && m.operation_date && m.geometry_type !== 'note')
    .map((m) => ({
      date: m.operation_date as string,
      type: m.type,
      title: m.title,
      incomeEur: m.income_eur ?? null,
      costEur: m.cost_eur ?? null,
    }));
  const response = await guestApi.post<ForestValueHistoryResponse>('/api/forest-value/guest/history', {
    ...valueBody(p),
    events,
  });
  return response.data;
}

function parseEur(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= MAX_EUR ? round2(n) : 'invalid';
}

// --- Work requests, offers and chats ----------------------------------------------------------

function pendingBids(requestId: number): DemoBid[] {
  return demoState().bids.filter((b) => b.work_request_id === requestId && b.status === 'pending');
}

/** The best pending offer: highest for a timber sale, lowest for a service; ties go to the earliest */
function bestBid(request: DemoWorkRequest): DemoBid | null {
  const sign = request.pricing === 'owner_receives' ? -1 : 1;
  return (
    [...pendingBids(request.id)].sort(
      (a, b) => sign * (a.amount_eur - b.amount_eur) || a.created_at.localeCompare(b.created_at) || a.id - b.id
    )[0] ?? null
  );
}

function bidSummary(request: DemoWorkRequest) {
  const bids = pendingBids(request.id);
  return {
    pricing: request.pricing,
    bid_count: bids.length,
    best_bid_eur: bestBid(request)?.amount_eur ?? null,
    latest_bid_at: bids.reduce<string | null>((latest, b) => (!latest || b.created_at > latest ? b.created_at : latest), null),
  };
}

function requestColumns(r: DemoWorkRequest) {
  return {
    id: r.id, note: r.note, created_at: r.created_at, type: r.type, title: r.title, area_ha: r.area_ha,
    target_price_eur: r.target_price_eur,
    geometry_type: (r.geometry?.type === 'Point' ? 'point' : 'area') as 'point' | 'area',
    geometry: r.geometry,
    ...bidSummary(r),
    photos: demoState()
      .photos.filter((p) => p.work_request_id === r.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
      .map((p) => ({ id: p.id, taken_at: p.taken_at })),
  };
}

function ownRequestOut(r: DemoWorkRequest): WorkRequest {
  const property = demoState().properties.find((p) => p.id === r.property_id);
  return {
    ...requestColumns(r),
    property_id: r.property_id,
    status: r.status,
    updated_at: r.updated_at,
    property_code: property?.property_code ?? null,
  };
}

function publicRequestOut(r: DemoWorkRequest): PublicWorkRequest {
  const point = r.geometry ? pointOnFeature({ type: 'Feature', properties: {}, geometry: r.geometry }) : null;
  const [lng, lat] = point?.geometry.coordinates ?? [0, 0];
  const mine = demoState()
    .bids.filter((b) => b.work_request_id === r.id && b.user_id === ME && b.status === 'pending')
    .sort(byNewest)[0];
  const property = demoState().properties.find((p) => p.id === r.property_id);
  return {
    ...requestColumns(r),
    lat,
    lng,
    is_own: r.user_id === ME,
    my_bid_eur: mine?.amount_eur ?? null,
    my_bid_chat_id: mine ? demoState().chats.find((c) => c.bid_id === mine.id)?.id ?? null : null,
    region_code: r.region_code,
    region_name: REGIONS.find((region) => region.code === r.region_code)?.name ?? null,
    property_code: property?.property_code ?? null,
    property_area_ha: property?.area_ha ?? r.property_area_ha,
    property_geometry: property?.geometry ?? r.property_geometry,
  };
}

function openRequest(id: number): DemoWorkRequest {
  const request = demoState().workRequests.find((r) => r.id === id);
  if (!request || request.status !== 'open') {
    throw new DemoHttpError(404, 'Työpyyntöä ei löytynyt tai se ei ole enää avoinna');
  }
  return request;
}

function ownRequest(id: number): DemoWorkRequest {
  const request = demoState().workRequests.find((r) => r.id === id && r.user_id === ME);
  if (!request) throw new DemoHttpError(404, 'Työpyyntöä ei löytynyt');
  return request;
}

function removeWorkRequestRows(requestId: number): void {
  const s = demoState();
  const chatIds = new Set(s.chats.filter((c) => c.work_request_id === requestId).map((c) => c.id));
  s.messages = s.messages.filter((m) => !chatIds.has(m.chat_id));
  s.chats = s.chats.filter((c) => !chatIds.has(c.id));
  s.bids = s.bids.filter((b) => b.work_request_id !== requestId);
  s.photos = s.photos.filter((p) => p.work_request_id !== requestId);
  s.workRequests = s.workRequests.filter((r) => r.id !== requestId);
}

/** Every vertex on the parcel or within a few metres of its edge */
function isWithinProperty(geometry: GeoJSONGeometry, property: DemoProperty): boolean {
  if (!geometry) return false;
  const points: [number, number][] =
    geometry.type === 'Point' ? [geometry.coordinates]
      : geometry.type === 'LineString' ? geometry.coordinates
        : geometry.type === 'Polygon' ? geometry.coordinates.flat()
          : geometry.coordinates.flat(2);
  return points.every(([lng, lat]) => {
    const proximity = parcelProximity(property.geometry, { lat, lng });
    return proximity !== null && proximity.distanceKm <= BOUNDARY_TOLERANCE_KM;
  });
}

const presence = new Map<number, number>();
const isPresent = (chatId: number) => Date.now() - (presence.get(chatId) ?? 0) < PRESENCE_TIMEOUT_MS;

function chatOf(id: number): DemoChat {
  const chat = demoState().chats.find((c) => c.id === id && (c.owner_id === ME || c.provider_id === ME));
  if (!chat) throw new DemoHttpError(404, 'Keskustelua ei löytynyt');
  return chat;
}

function chatSummary(chat: DemoChat): ChatSummary {
  const s = demoState();
  const request = s.workRequests.find((r) => r.id === chat.work_request_id);
  const bid = s.bids.find((b) => b.id === chat.bid_id);
  const otherId = chat.owner_id === ME ? chat.provider_id : chat.owner_id;
  const messages = s.messages.filter((m) => m.chat_id === chat.id).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const last = messages[messages.length - 1];
  const firstPhoto = s.photos.filter((p) => p.work_request_id === chat.work_request_id).sort((a, b) => a.id - b.id)[0];
  return {
    id: chat.id,
    work_request_id: chat.work_request_id,
    owner_id: chat.owner_id,
    provider_id: chat.provider_id,
    title: request?.title ?? '',
    pricing: request?.pricing,
    created_at: chat.created_at,
    other_user_id: otherId,
    other_email: userEmail(otherId),
    other_name: userName(otherId),
    request_type: request?.type,
    request_area_ha: request?.area_ha ?? null,
    request_target_price_eur: request?.target_price_eur ?? null,
    request_status: request?.status,
    request_photo_id: firstPhoto?.id ?? null,
    last_message: last?.body ?? null,
    last_message_at: last?.created_at ?? null,
    last_counter_offer_eur: last?.counter_offer_eur ?? null,
    last_has_image: last ? last.image_base64 !== null : null,
    unread_count: messages.filter((m) => m.sender_id !== ME && m.read_at === null).length,
    bid_id: bid?.id ?? null,
    bid_amount_eur: bid?.amount_eur ?? null,
    bid_status: bid?.status ?? null,
  };
}

function messageOut(m: DemoMessage) {
  return {
    id: m.id, sender_id: m.sender_id, body: m.body, image_base64: m.image_base64, image_type: m.image_type,
    counter_offer_eur: m.counter_offer_eur, counter_offer_status: m.counter_offer_status, created_at: m.created_at,
  };
}

function addMessage(chatId: number, senderId: number, fields: Partial<DemoMessage>): DemoMessage {
  const message: DemoMessage = {
    id: nextDemoId(), chat_id: chatId, sender_id: senderId, body: null, image_base64: null, image_type: null,
    counter_offer_eur: null, counter_offer_status: null, created_at: nowIso(), read_at: null,
    ...fields,
  };
  demoState().messages.push(message);
  return message;
}

/** A message from the other party reaches the demo user as a notification unless the chat is open */
function notifyMe(chat: DemoChat, n: Omit<DemoNotification, 'id' | 'read_at' | 'created_at'>): void {
  if (!isPresent(chat.id)) notify(n);
}

// --- Simulated other parties ------------------------------------------------------------------
// In the demo, owners and work providers answer by themselves after a moment, so the flows
// (offer → chat → reply) can be tried alone.

const REPLY_DELAY_MS = 6000;
const FIRST_BID_DELAY_MS = 9000;

function later(delayMs: number, action: () => void): void {
  window.setTimeout(() => {
    try {
      action();
      saveDemoState();
      window.dispatchEvent(new Event('metsuri-demo-update'));
    } catch {
      // The data the reply was about may have been removed meanwhile
    }
  }, delayMs);
}

function replyOnce(chatId: number, text: string): void {
  const chat = demoState().chats.find((c) => c.id === chatId);
  if (!chat || chat.auto_replied) return;
  chat.auto_replied = true;
  later(REPLY_DELAY_MS, () => {
    const current = demoState().chats.find((c) => c.id === chatId);
    const request = demoState().workRequests.find((r) => r.id === current?.work_request_id);
    if (!current || !request) return;
    const other = current.owner_id === ME ? current.provider_id : current.owner_id;
    addMessage(current.id, other, { body: text });
    notifyMe(current, {
      type: 'chat_message',
      title: 'Uusi chat-viesti',
      body: `Uusi viesti työpyyntöön ${request.title}.`,
      link: `/chat/${current.id}`,
    });
  });
}

/** A provider offers on the demo user's new work request a moment after it is published */
function simulateFirstBid(requestId: number): void {
  later(FIRST_BID_DELAY_MS, () => {
    const request = demoState().workRequests.find((r) => r.id === requestId && r.status === 'open');
    if (!request) return;
    const providerId = 900101;
    const factor = request.pricing === 'owner_receives' ? 1.04 : 0.95;
    const amount = Math.max(10, Math.round((request.target_price_eur * factor) / 10) * 10);
    const bid: DemoBid = {
      id: nextDemoId(), work_request_id: request.id, user_id: providerId, amount_eur: amount,
      status: 'pending', created_at: nowIso(),
    };
    demoState().bids.push(bid);
    const chat: DemoChat = {
      id: nextDemoId(), work_request_id: request.id, owner_id: ME, provider_id: providerId, bid_id: bid.id,
      owner_deleted: false, provider_deleted: false, created_at: nowIso(),
    };
    demoState().chats.push(chat);
    addMessage(chat.id, providerId, {
      body: `Hei! Näimme työpyyntösi ja tarjoamme ${formatEur(amount)} €. Voimme tulla katsomaan kohteen ensi viikolla.`,
    });
    notify({
      type: 'new_bid',
      title: `Uusi tarjous ${formatEur(amount)} € työpyyntöön ${request.title}`,
      body: 'Työpyyntöösi on tullut uusi tarjous.',
      link: `/map?workRequest=${request.id}`,
    });
  });
}

// --- Forum ------------------------------------------------------------------------------------

function forumPostOut(p: { id: number; author_name: string; body: string; created_at: string; user_id: number; reported: boolean }): ForumPost {
  return {
    id: p.id, author_name: p.author_name, body: p.body, created_at: p.created_at,
    is_own: p.user_id === ME, is_hidden: false, is_deleted: false, has_reported: p.reported,
  };
}

function cleanText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return text.length >= min && text.length <= max ? text : null;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/g, ' ').trim();
  return name.length >= 2 && name.length <= 40 ? name : null;
}

function rememberName(name: string): void {
  const me = demoState().users.find((u) => u.id === ME);
  if (me) me.name = name;
}

// --- Routes -----------------------------------------------------------------------------------

const routes: [string, string, Handler][] = [
  // Properties
  ['GET', '/api/properties', () => ({
    data: demoState().properties.filter((p) => p.user_id === ME).sort(byNewest).map(propertyOut),
  })],
  ['POST', '/api/properties', (req) => {
    const { name, geometry } = body(req);
    if (typeof name !== 'string' || !name.trim() || !isAreaGeometry(geometry)) {
      throw new DemoHttpError(400, 'Name and geometry are required');
    }
    const property: DemoProperty = {
      id: nextDemoId(), user_id: ME, name: name.trim(), property_code: null, source: 'manual',
      area_ha: areaHa(geometry), geometry, region_code: null, field_stand_ids: [], manual: null,
      created_at: nowIso(), updated_at: nowIso(),
    };
    demoState().properties.push(property);
    return { status: 201, data: propertyOut(property) };
  }],
  ['POST', '/api/properties/import', (req) => {
    const { name, property_code, geometry, area_ha } = body(req);
    if (typeof property_code !== 'string' || !property_code.trim() || !isAreaGeometry(geometry)) {
      throw new DemoHttpError(400, 'property_code and geometry are required');
    }
    if (demoState().properties.some((p) => p.user_id === ME && p.property_code === property_code.trim())) {
      throw new DemoHttpError(409, 'Kiinteistö on jo tallennettu omiin kiinteistöihin');
    }
    const property: DemoProperty = {
      id: nextDemoId(), user_id: ME,
      name: typeof name === 'string' && name.trim() ? name.trim() : property_code.trim(),
      property_code: property_code.trim(), source: 'mml',
      area_ha: typeof area_ha === 'number' && area_ha > 0 ? area_ha : areaHa(geometry),
      geometry, region_code: null, field_stand_ids: [], manual: null, created_at: nowIso(), updated_at: nowIso(),
    };
    demoState().properties.push(property);
    return { status: 201, data: propertyOut(property) };
  }],
  ['PUT', '/api/properties/:id', (req) => {
    const property = ownProperty(idParam(req));
    const { name, geometry } = body(req);
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) throw new DemoHttpError(400, 'Anna kiinteistölle nimi');
      property.name = name.trim();
    }
    if (geometry !== undefined) {
      if (!isAreaGeometry(geometry)) throw new DemoHttpError(400, 'Invalid geometry');
      property.geometry = geometry;
      property.area_ha = areaHa(geometry);
    }
    property.updated_at = nowIso();
    return { data: propertyOut(property) };
  }],
  ['DELETE', '/api/properties/:id', (req) => {
    removePropertyRows(ownProperty(idParam(req)).id);
    return { data: { message: 'Property deleted' } };
  }],
  ['GET', '/api/properties/:id/markings', (req) => {
    const property = ownProperty(idParam(req));
    return {
      data: demoState().markings.filter((m) => m.property_id === property.id).sort(byNewest).map(markingOut),
    };
  }],
  ['GET', '/api/properties/:id/forest-value', async (req) => ({
    data: await forestValue(ownProperty(idParam(req)), req.query.refresh === '1'),
  })],
  ['GET', '/api/properties/:id/forest-value/history', async (req) => ({
    data: await forestValueHistory(ownProperty(idParam(req))),
  })],
  ['POST', '/api/properties/:id/forest-value/manual', async (req) => {
    const property = ownProperty(idParam(req));
    const { species, ageYears, volumeM3PerHa } = body(req);
    property.manual = { species, ageYears, volumeM3PerHa } as DemoProperty['manual'];
    try {
      return { data: await forestValue(property, true) };
    } catch (error) {
      property.manual = null;
      throw error;
    }
  }],
  ['PUT', '/api/properties/:id/forest-value/fields/:standId', async (req) => {
    const property = ownProperty(idParam(req));
    if (!property.field_stand_ids.includes(req.params.standId)) property.field_stand_ids.push(req.params.standId);
    return { data: await forestValue(property) };
  }],
  ['DELETE', '/api/properties/:id/forest-value/fields/:standId', async (req) => {
    const property = ownProperty(idParam(req));
    property.field_stand_ids = property.field_stand_ids.filter((id) => id !== req.params.standId);
    return { data: await forestValue(property) };
  }],

  // Done works
  ['GET', '/api/markings', (req) => {
    const propertyId = req.query.propertyId ? Number(req.query.propertyId) : null;
    if (propertyId !== null) ownProperty(propertyId);
    return {
      data: demoState()
        .markings.filter((m) => m.user_id === ME && (propertyId === null || m.property_id === propertyId))
        .sort(byNewest)
        .map(markingOut),
    };
  }],
  ['POST', '/api/markings', (req) => {
    const b = body(req);
    const type = b.type as MarkingType;
    const geometryType = b.geometry_type as DemoMarking['geometry_type'];
    if (!type || !geometryType || !b.title) throw new DemoHttpError(400, 'Type, geometry_type, and title are required');
    if (!VALID_TYPES.includes(type)) throw new DemoHttpError(400, `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}`);
    if (!VALID_GEOMETRY_TYPES.includes(geometryType)) throw new DemoHttpError(400, 'Invalid geometry_type');
    const operationDate = typeof b.operation_date === 'string' && ISO_DATE.test(b.operation_date) ? b.operation_date : today();
    const income = parseEur(b.income_eur);
    const cost = parseEur(b.cost_eur);
    if (income === 'invalid' || cost === 'invalid') throw new DemoHttpError(400, `Tulon ja kulun pitää olla 0–${MAX_EUR} €`);
    if (b.property_id) ownProperty(Number(b.property_id));
    const followUp = geometryType === 'note'
      ? { followUpDateStart: null, followUpDateEnd: null, followUpNote: null }
      : getFollowUpRecommendation(type, operationDate);
    const marking: DemoMarking = {
      id: nextDemoId(), user_id: ME, property_id: b.property_id ? Number(b.property_id) : null, type,
      geometry_type: geometryType, title: String(b.title),
      description: typeof b.description === 'string' && b.description ? b.description : null,
      geometry: (b.geometry as GeoJSONGeometry) ?? null,
      area_ha: typeof b.area_ha === 'number' ? b.area_ha : null,
      operation_date: operationDate,
      follow_up_date_start: followUp.followUpDateStart, follow_up_date_end: followUp.followUpDateEnd,
      follow_up_note: followUp.followUpNote,
      income_eur: income, cost_eur: cost, created_at: nowIso(), updated_at: nowIso(),
    };
    demoState().markings.push(marking);
    return { status: 201, data: markingOut(marking) };
  }],
  ['PUT', '/api/markings/:id', (req) => {
    const marking = demoState().markings.find((m) => m.id === idParam(req) && m.user_id === ME);
    if (!marking) throw new DemoHttpError(404, 'Marking not found');
    const b = body(req);
    if (b.operation_date !== undefined && b.operation_date !== null &&
      (typeof b.operation_date !== 'string' || !ISO_DATE.test(b.operation_date))) {
      throw new DemoHttpError(400, 'operation_date must be in YYYY-MM-DD format');
    }
    if (b.type && !VALID_TYPES.includes(b.type as MarkingType)) throw new DemoHttpError(400, 'Invalid type');
    if (b.geometry_type && !VALID_GEOMETRY_TYPES.includes(b.geometry_type as string)) {
      throw new DemoHttpError(400, 'Invalid geometry_type');
    }
    const income = b.income_eur === undefined ? undefined : parseEur(b.income_eur);
    const cost = b.cost_eur === undefined ? undefined : parseEur(b.cost_eur);
    if (income === 'invalid' || cost === 'invalid') throw new DemoHttpError(400, `Tulon ja kulun pitää olla 0–${MAX_EUR} €`);
    if (b.property_id !== undefined && b.property_id !== null) ownProperty(Number(b.property_id));

    if (b.type) marking.type = b.type as MarkingType;
    if (b.geometry_type) marking.geometry_type = b.geometry_type as DemoMarking['geometry_type'];
    if (b.title !== undefined) marking.title = String(b.title);
    if (b.description !== undefined) marking.description = (b.description as string | null) ?? null;
    if (b.area_ha !== undefined) marking.area_ha = (b.area_ha as number | null) ?? null;
    if (b.geometry) marking.geometry = b.geometry as GeoJSONGeometry;
    if (b.property_id !== undefined) marking.property_id = (b.property_id as number | null) ?? null;
    if (b.operation_date !== undefined) marking.operation_date = (b.operation_date as string | null) ?? null;
    if (income !== undefined) marking.income_eur = income;
    if (cost !== undefined) marking.cost_eur = cost;

    // Same rule as the server: an explicit follow-up wins, otherwise it follows the work and its date
    if (b.follow_up_date_start !== undefined || b.follow_up_date_end !== undefined || b.follow_up_note !== undefined) {
      if (b.follow_up_date_start !== undefined) marking.follow_up_date_start = (b.follow_up_date_start as string) || null;
      if (b.follow_up_date_end !== undefined) marking.follow_up_date_end = (b.follow_up_date_end as string) || null;
      if (b.follow_up_note !== undefined) marking.follow_up_note = (b.follow_up_note as string) || null;
    } else if (marking.operation_date) {
      const followUp = marking.geometry_type === 'note'
        ? { followUpDateStart: null, followUpDateEnd: null, followUpNote: null }
        : getFollowUpRecommendation(marking.type, marking.operation_date);
      marking.follow_up_date_start = followUp.followUpDateStart;
      marking.follow_up_date_end = followUp.followUpDateEnd;
      marking.follow_up_note = followUp.followUpNote;
    }
    marking.updated_at = nowIso();
    return { data: markingOut(marking) };
  }],
  ['DELETE', '/api/markings/:id', (req) => {
    const id = idParam(req);
    const s = demoState();
    if (!s.markings.some((m) => m.id === id && m.user_id === ME)) throw new DemoHttpError(404, 'Marking not found');
    s.markings = s.markings.filter((m) => m.id !== id);
    return { data: { message: 'Marking deleted' } };
  }],

  // Map: the layer config needs a login, so the map falls back to the public configuration
  ['GET', '/api/map/layers', () => {
    throw new DemoHttpError(404, 'Not available in the demo');
  }],

  // Work requests
  ['GET', '/api/work-requests', (req) => {
    const { type, region } = req.query;
    if (type && !VALID_TYPES.includes(type as MarkingType)) throw new DemoHttpError(400, 'Invalid type');
    return {
      data: demoState()
        .workRequests.filter((r) => r.status === 'open' && (!type || r.type === type) && (!region || r.region_code === region))
        .sort(byNewest)
        .map(publicRequestOut),
    };
  }],
  ['GET', '/api/work-requests/regions', () => ({ data: [...REGIONS].sort((a, b) => a.name.localeCompare(b.name, 'fi')) })],
  ['GET', '/api/work-requests/mine', () => ({
    data: demoState().workRequests.filter((r) => r.user_id === ME).sort(byNewest).map(ownRequestOut),
  })],
  ['POST', '/api/work-requests', (req) => {
    const { property_id, type, title, geometry, note, pricing, target_price_eur } = body(req);
    if (!Number.isInteger(property_id)) throw new DemoHttpError(400, 'property_id is required');
    if (!VALID_TYPES.includes(type as MarkingType)) throw new DemoHttpError(400, 'Invalid type');
    if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH) {
      throw new DemoHttpError(400, 'Anna työpyynnölle otsikko');
    }
    const geometryType = (geometry as { type?: string } | null)?.type;
    if (!geometryType || !['Point', 'Polygon', 'MultiPolygon'].includes(geometryType)) {
      throw new DemoHttpError(400, 'Merkitse työn alue kartalle');
    }
    if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > MAX_NOTE_LENGTH)) {
      throw new DemoHttpError(400, `note must be a string of at most ${MAX_NOTE_LENGTH} characters`);
    }
    if (pricing !== 'owner_receives' && pricing !== 'owner_pays') {
      throw new DemoHttpError(400, 'Valitse, onko kyse puukaupasta vai palvelutyöstä');
    }
    if (!isValidEur(target_price_eur)) throw new DemoHttpError(400, `Anna hinta euroina (0–${MAX_EUR} €)`);
    const property = ownProperty(property_id as number);
    if (!isWithinProperty(geometry as GeoJSONGeometry, property)) {
      throw new DemoHttpError(400, 'Työn alueen pitää olla valitun kiinteistön rajojen sisällä');
    }
    const request: DemoWorkRequest = {
      id: nextDemoId(), user_id: ME, property_id: property.id, type: type as MarkingType, title: title.trim(),
      geometry: geometry as GeoJSONGeometry,
      area_ha: geometryType === 'Point' ? null : areaHa(geometry as GeoJSONGeometry),
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
      pricing, target_price_eur: round2(target_price_eur), status: 'open', region_code: property.region_code,
      property_geometry: property.geometry, property_area_ha: property.area_ha,
      created_at: nowIso(), updated_at: nowIso(),
    };
    demoState().workRequests.push(request);
    simulateFirstBid(request.id);
    return { status: 201, data: ownRequestOut(request) };
  }],
  ['POST', '/api/work-requests/:id/bids', (req) => {
    const amount = Number(body(req).amount_eur);
    const id = idParam(req);
    if (!isValidEur(amount)) throw new DemoHttpError(400, `Tarjouksen pitää olla 0–${MAX_EUR} €`);
    const request = openRequest(id);
    if (request.user_id === ME) throw new DemoHttpError(403, 'Omaan työpyyntöön ei voi tehdä tarjousta');
    const bid: DemoBid = {
      id: nextDemoId(), work_request_id: id, user_id: ME, amount_eur: round2(amount), status: 'pending', created_at: nowIso(),
    };
    demoState().bids.push(bid);
    const chat: DemoChat = {
      id: nextDemoId(), work_request_id: id, owner_id: request.user_id, provider_id: ME, bid_id: bid.id,
      owner_deleted: false, provider_deleted: false, created_at: nowIso(),
    };
    demoState().chats.push(chat);
    if (bestBid(request)?.user_id !== ME) {
      notify({
        type: 'bid_no_longer_best',
        title: `Työpyyntöön ${request.title} tuli parempi tarjous`,
        body: 'Oma tarjouksesi ei ole enää paras.',
        link: `/tyontarjoajat?workRequest=${id}`,
      });
    }
    replyOnce(chat.id, 'Kiitos tarjouksesta! Käyn tarjoukset läpi tällä viikolla ja palaan asiaan.');
    return { status: 201, data: publicRequestOut(request) };
  }],
  ['PUT', '/api/work-requests/:id/bids', (req) => {
    const amount = Number(body(req).amount_eur);
    const id = idParam(req);
    if (!isValidEur(amount)) throw new DemoHttpError(400, `Tarjouksen pitää olla 0–${MAX_EUR} €`);
    const request = demoState().workRequests.find((r) => r.id === id && r.status === 'open');
    const bid = request && pendingBids(id).find((b) => b.user_id === ME);
    if (!request || !bid) throw new DemoHttpError(404, 'Muokattavaa tarjousta ei löytynyt');
    bid.amount_eur = round2(amount);
    bid.created_at = nowIso();
    return { data: publicRequestOut(request) };
  }],
  ['DELETE', '/api/work-requests/:id/bids', (req) => {
    const id = idParam(req);
    const request = openRequest(id);
    const mine = pendingBids(id).filter((b) => b.user_id === ME);
    if (mine.length === 0) throw new DemoHttpError(404, 'Tarjousta ei löytynyt');
    const bidIds = new Set(mine.map((b) => b.id));
    mine.forEach((b) => {
      b.status = 'withdrawn';
      b.created_at = nowIso();
    });
    const chatIds = new Set(demoState().chats.filter((c) => c.bid_id !== null && bidIds.has(c.bid_id)).map((c) => c.id));
    demoState().messages.forEach((m) => {
      if (chatIds.has(m.chat_id) && m.sender_id === ME && m.counter_offer_status === 'pending') {
        m.counter_offer_status = 'withdrawn';
        m.body = null;
      }
    });
    return { data: publicRequestOut(request) };
  }],
  ['POST', '/api/work-requests/:id/photos', async (req) => {
    const request = ownRequest(idParam(req));
    if (!(req.body instanceof Blob) || !req.body.type.startsWith('image/')) {
      throw new DemoHttpError(400, 'Tiedosto ei ole kuva (JPEG, PNG tai WebP)');
    }
    if (demoState().photos.filter((p) => p.work_request_id === request.id).length >= MAX_PHOTOS_PER_REQUEST) {
      throw new DemoHttpError(400, `Työpyyntöön voi liittää enintään ${MAX_PHOTOS_PER_REQUEST} kuvaa`);
    }
    const takenAt = req.headers['x-taken-at'];
    demoState().photos.push({
      id: nextDemoId(), work_request_id: request.id, url: await blobToDataUrl(req.body),
      taken_at: takenAt && !Number.isNaN(Date.parse(takenAt)) ? new Date(takenAt).toISOString() : null,
      created_at: nowIso(),
    });
    return { status: 201, data: ownRequestOut(request) };
  }],
  ['DELETE', '/api/work-requests/:id/photos/:photoId', (req) => {
    const request = ownRequest(idParam(req));
    const photoId = idParam(req, 'photoId');
    const s = demoState();
    if (!s.photos.some((p) => p.id === photoId && p.work_request_id === request.id)) {
      throw new DemoHttpError(404, 'Kuvaa ei löytynyt');
    }
    s.photos = s.photos.filter((p) => p.id !== photoId);
    return { data: ownRequestOut(request) };
  }],
  ['DELETE', '/api/work-requests/:id', (req) => {
    const id = idParam(req);
    if (!demoState().workRequests.some((r) => r.id === id && r.user_id === ME)) {
      throw new DemoHttpError(404, 'Work request not found');
    }
    removeWorkRequestRows(id);
    return { data: { message: 'Work request withdrawn' } };
  }],

  // Chats
  ['GET', '/api/chats', () => ({
    data: demoState()
      .chats.filter((c) => (c.owner_id === ME ? !c.owner_deleted : c.provider_id === ME && !c.provider_deleted))
      .map(chatSummary)
      .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)),
  })],
  ['DELETE', '/api/chats/:id', (req) => {
    const chat = chatOf(idParam(req));
    if (chat.owner_id === ME) chat.owner_deleted = true;
    else chat.provider_deleted = true;
    return { status: 204 };
  }],
  ['POST', '/api/chats/:id/presence', (req) => {
    presence.set(chatOf(idParam(req)).id, Date.now());
    return { status: 204 };
  }],
  ['DELETE', '/api/chats/:id/presence', (req) => {
    presence.delete(idParam(req));
    return { status: 204 };
  }],
  ['GET', '/api/chats/:id/messages', (req) => {
    const chat = chatOf(idParam(req));
    const messages = demoState().messages.filter((m) => m.chat_id === chat.id);
    messages.forEach((m) => {
      if (m.sender_id !== ME && m.read_at === null) m.read_at = nowIso();
    });
    return {
      data: {
        chat: chatSummary(chat),
        messages: messages
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
          .map(messageOut),
      },
    };
  }],
  ['POST', '/api/chats/:id/messages', (req) => {
    const chat = chatOf(idParam(req));
    const b = body(req);
    const text = typeof b.body === 'string' ? b.body.trim() : '';
    const image = typeof b.image_base64 === 'string' ? b.image_base64 : '';
    const imageType = typeof b.image_type === 'string' ? b.image_type : null;
    const counterOffer = b.counter_offer_eur === undefined ? null : Number(b.counter_offer_eur);
    if (text.length > MAX_MESSAGE_LENGTH || (!text && !image && (counterOffer === null || !Number.isFinite(counterOffer)))) {
      throw new DemoHttpError(400, 'Viesti on tyhjä tai liian pitkä');
    }
    if (image && !imageType?.startsWith('image/')) throw new DemoHttpError(400, 'Kuva on virheellinen tai liian suuri');
    if (counterOffer !== null && !isValidEur(counterOffer)) throw new DemoHttpError(400, 'Vastatarjouksen summa on virheellinen');
    if (counterOffer !== null) {
      demoState().messages.forEach((m) => {
        if (m.chat_id === chat.id && m.counter_offer_status === 'pending') m.counter_offer_status = 'declined';
      });
    }
    const message = addMessage(chat.id, ME, {
      body: text || null,
      image_base64: image || null,
      image_type: image ? imageType : null,
      counter_offer_eur: counterOffer,
      counter_offer_status: counterOffer === null ? null : 'pending',
    });
    chat.owner_deleted = false;
    chat.provider_deleted = false;
    replyOnce(chat.id, chat.owner_id === ME
      ? 'Kiitos viestistä! Katsotaan asia ja palaan pian.'
      : 'Kiitos, hyvä tietää. Palaan asiaan, kun olen vertaillut tarjoukset.');
    return { status: 201, data: messageOut(message) };
  }],
  ['POST', '/api/chats/:id/messages/:messageId/accept', (req) => {
    const chat = chatOf(idParam(req));
    const message = demoState().messages.find((m) =>
      m.id === idParam(req, 'messageId') && m.chat_id === chat.id && m.sender_id !== ME && m.counter_offer_status === 'pending');
    if (!message) throw new DemoHttpError(400, 'Vastatarjousta ei voi hyväksyä');
    const bid = demoState().bids.find((b) => b.id === chat.bid_id && (b.status === 'pending' || b.status === 'withdrawn'));
    if (!bid) throw new DemoHttpError(400, 'Tarjousta ei voi enää hyväksyä');
    message.counter_offer_status = 'accepted';
    bid.amount_eur = message.counter_offer_eur as number;
    bid.status = 'accepted';
    closeRequest(chat.work_request_id);
    addMessage(chat.id, ME, { body: `Tarjous ${Number(bid.amount_eur).toLocaleString('fi-FI')} € hyväksytty.` });
    return { data: { id: message.id, counter_offer_eur: message.counter_offer_eur } };
  }],
  ['POST', '/api/chats/:id/messages/:messageId/reject', (req) => {
    const chat = chatOf(idParam(req));
    const message = demoState().messages.find((m) =>
      m.id === idParam(req, 'messageId') && m.chat_id === chat.id && m.sender_id !== ME && m.counter_offer_status === 'pending');
    if (!message) throw new DemoHttpError(400, 'Tarjousta ei voi hylätä');
    message.counter_offer_status = 'declined';
    const bid = demoState().bids.find((b) => b.id === chat.bid_id && b.status === 'pending');
    if (bid) bid.status = 'withdrawn';
    return { data: { id: message.id } };
  }],
  ['POST', '/api/chats/:id/offer/accept', (req) => {
    const chat = demoState().chats.find((c) => c.id === idParam(req) && c.owner_id === ME);
    if (!chat) throw new DemoHttpError(404, 'Tarjousta ei löytynyt');
    const bid = demoState().bids.find((b) => b.id === chat.bid_id);
    if (!bid || bid.status !== 'pending') throw new DemoHttpError(400, 'Tarjousta ei voi enää hyväksyä');
    bid.status = 'accepted';
    closeRequest(chat.work_request_id);
    addMessage(chat.id, ME, { body: `Tarjous ${Number(bid.amount_eur).toLocaleString('fi-FI')} € hyväksytty.` });
    return { data: { status: 'accepted', amount_eur: bid.amount_eur } };
  }],
  ['POST', '/api/chats/:id/offer/new', (req) => {
    const chat = chatOf(idParam(req));
    const amount = Number(body(req).amount_eur);
    const bid = demoState().bids.find((b) => b.id === chat.bid_id);
    if (!bid || bid.status !== 'withdrawn') throw new DemoHttpError(400, 'Uutta tarjousta ei voi tehdä tässä chatissa');
    if (!isValidEur(amount)) throw new DemoHttpError(400, `Tarjouksen pitää olla 0–${MAX_EUR} €`);
    const request = demoState().workRequests.find((r) => r.id === chat.work_request_id);
    if (!request || request.status !== 'open') throw new DemoHttpError(400, 'Työpyyntö ei ole enää avoinna');
    demoState().messages.forEach((m) => {
      if (m.chat_id === chat.id && m.counter_offer_status === 'pending') m.counter_offer_status = 'declined';
    });
    if (chat.provider_id === ME) {
      bid.amount_eur = round2(amount);
      bid.status = 'pending';
    }
    const message = addMessage(chat.id, ME, { counter_offer_eur: round2(amount), counter_offer_status: 'pending' });
    chat.owner_deleted = false;
    chat.provider_deleted = false;
    return { status: 201, data: messageOut(message) };
  }],
  ['POST', '/api/chats/:id/offer/cancel', (req) => {
    const chat = chatOf(idParam(req));
    const bid = demoState().bids.find((b) => b.id === chat.bid_id);
    if (!bid || bid.status !== 'accepted') throw new DemoHttpError(400, 'Hyväksyttyä tarjousta ei voi perua');
    bid.status = 'withdrawn';
    const request = demoState().workRequests.find((r) => r.id === chat.work_request_id);
    if (request && request.status === 'closed') {
      request.status = 'open';
      request.updated_at = nowIso();
    }
    addMessage(chat.id, ME, { body: `Tarjous ${Number(bid.amount_eur).toLocaleString('fi-FI')} € peruttu.` });
    return { data: { status: 'withdrawn', amount_eur: bid.amount_eur } };
  }],

  // Notifications
  ['GET', '/api/notifications', () => {
    const notifications = [...demoState().notifications].sort(byNewest).slice(0, 50);
    return {
      data: {
        notifications,
        unreadCount: demoState().notifications.filter((n) => n.read_at === null).length,
      },
    };
  }],
  ['POST', '/api/notifications/read-all', () => {
    demoState().notifications.forEach((n) => {
      if (n.read_at === null) n.read_at = nowIso();
    });
    return { data: { message: 'ok' } };
  }],
  ['POST', '/api/notifications/:id/read', (req) => {
    const notification = demoState().notifications.find((n) => n.id === idParam(req));
    if (!notification) throw new DemoHttpError(404, 'Notification not found');
    notification.read_at ??= nowIso();
    return { data: { message: 'ok' } };
  }],

  // Forum
  ['GET', '/api/forum/me', (): DemoResponse => {
    const me: ForumMe = { display_name: userName(ME), role: 'user', forum_banned: false };
    return { data: me };
  }],
  ['GET', '/api/forum/stats', (): DemoResponse => {
    const s = demoState();
    const categories: ForumStats['categories'] = {};
    s.forumThreads.forEach((t) => {
      categories[t.category] = (categories[t.category] ?? 0) + 1;
    });
    const counts = new Map<string, { count: number; latest: string }>();
    s.forumPosts.forEach((p) => {
      const current = counts.get(p.author_name) ?? { count: 0, latest: '' };
      counts.set(p.author_name, { count: current.count + 1, latest: p.created_at > current.latest ? p.created_at : current.latest });
    });
    const topWriters = [...counts.entries()]
      .sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest))
      .slice(0, 5)
      .map(([author_name, { count }]) => ({ author_name, post_count: count }));
    return { data: { categories, top_writers: topWriters } satisfies ForumStats };
  }],
  ['GET', '/api/forum/threads', (req): DemoResponse => {
    const s = demoState();
    const { category, q, sort, own } = req.query;
    const search = q?.replace(/\s+/g, ' ').trim().slice(0, 100).toLocaleLowerCase('fi') ?? '';
    const threads: ForumThreadSummary[] = s.forumThreads
      .map((t) => {
        const posts = s.forumPosts.filter((p) => p.thread_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
        return {
          id: t.id, title: t.title, category: t.category, author_name: posts[0]?.author_name ?? '',
          preview: (posts[0]?.body ?? '').slice(0, 200), reply_count: Math.max(0, posts.length - 1),
          created_at: t.created_at, last_post_at: posts[posts.length - 1]?.created_at ?? t.created_at,
          is_own: t.user_id === ME,
        };
      })
      .filter((t) =>
        (!category || t.category === category) &&
        (own !== '1' || t.is_own) &&
        (!search || t.title.toLocaleLowerCase('fi').includes(search) || t.preview.toLocaleLowerCase('fi').includes(search)))
      .sort((a, b) =>
        sort === 'new' ? b.created_at.localeCompare(a.created_at)
          : sort === 'replies' ? b.reply_count - a.reply_count || b.last_post_at.localeCompare(a.last_post_at)
            : b.last_post_at.localeCompare(a.last_post_at));
    return { data: threads };
  }],
  ['GET', '/api/forum/threads/:id', (req): DemoResponse => {
    const thread = demoState().forumThreads.find((t) => t.id === idParam(req));
    if (!thread) throw new DemoHttpError(404, 'Keskustelua ei löytynyt');
    const data: ForumThread = {
      id: thread.id, title: thread.title, category: thread.category, created_at: thread.created_at,
      posts: demoState()
        .forumPosts.filter((p) => p.thread_id === thread.id)
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
        .map(forumPostOut),
    };
    return { data };
  }],
  ['POST', '/api/forum/threads', (req) => {
    const b = body(req);
    const title = cleanText(b.title, 3, 150);
    const text = cleanText(b.body, 1, 5000);
    const name = cleanName(b.author_name);
    const category = b.category === undefined ? 'yleinen' : b.category;
    if (!['metsanhoito', 'puukauppa', 'urakointi', 'tuhot', 'yleinen'].includes(category as string)) {
      throw new DemoHttpError(400, 'Valitse keskustelulle aihealue');
    }
    if (!title) throw new DemoHttpError(400, 'Anna otsikko (3–150 merkkiä)');
    if (!text) throw new DemoHttpError(400, 'Kirjoita viesti (enintään 5000 merkkiä)');
    if (!name) throw new DemoHttpError(400, 'Anna nimimerkki (2–40 merkkiä)');
    const id = nextDemoId();
    demoState().forumThreads.push({ id, user_id: ME, title, category: category as ForumThread['category'], created_at: nowIso() });
    demoState().forumPosts.push({ id: nextDemoId(), thread_id: id, user_id: ME, author_name: name, body: text, created_at: nowIso(), reported: false });
    rememberName(name);
    return { status: 201, data: { id } };
  }],
  ['POST', '/api/forum/threads/:id/posts', (req) => {
    const thread = demoState().forumThreads.find((t) => t.id === idParam(req));
    const b = body(req);
    const text = cleanText(b.body, 1, 5000);
    const name = cleanName(b.author_name);
    if (!text) throw new DemoHttpError(400, 'Kirjoita viesti (enintään 5000 merkkiä)');
    if (!name) throw new DemoHttpError(400, 'Anna nimimerkki (2–40 merkkiä)');
    if (!thread) throw new DemoHttpError(404, 'Keskustelua ei löytynyt');
    const post = { id: nextDemoId(), thread_id: thread.id, user_id: ME, author_name: name, body: text, created_at: nowIso(), reported: false };
    demoState().forumPosts.push(post);
    rememberName(name);
    return { status: 201, data: forumPostOut(post) };
  }],
  ['DELETE', '/api/forum/posts/:id', (req) => {
    const s = demoState();
    const post = s.forumPosts.find((p) => p.id === idParam(req) && p.user_id === ME);
    if (!post) throw new DemoHttpError(404, 'Viestiä ei löytynyt');
    s.forumPosts = s.forumPosts.filter((p) => p.id !== post.id);
    const threadDeleted = !s.forumPosts.some((p) => p.thread_id === post.thread_id);
    if (threadDeleted) s.forumThreads = s.forumThreads.filter((t) => t.id !== post.thread_id);
    return { data: { thread_deleted: threadDeleted } };
  }],
  ['POST', '/api/forum/posts/:id/reports', (req) => {
    const post = demoState().forumPosts.find((p) => p.id === idParam(req));
    if (!post) throw new DemoHttpError(404, 'Viestiä ei löytynyt');
    if (post.user_id === ME) throw new DemoHttpError(400, 'Et voi ilmoittaa omasta viestistäsi');
    post.reported = true;
    return { status: 201, data: { message: 'Report received' } };
  }],
];

function closeRequest(requestId: number): void {
  const request = demoState().workRequests.find((r) => r.id === requestId);
  if (request && request.status === 'open') {
    request.status = 'closed';
    request.updated_at = nowIso();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new DemoHttpError(400, 'Kuvan lukeminen epäonnistui'));
    reader.readAsDataURL(blob);
  });
}

// Compiled once: "/api/chats/:id/messages" → /^\/api\/chats\/([^/]+)\/messages$/ with param names
const compiled = routes.map(([method, pattern, handler]) => {
  const names: string[] = [];
  const regex = new RegExp(
    `^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_m, name: string) => {
      names.push(name);
      return '([^/]+)';
    })}$`
  );
  return { method, regex, names, handler };
});

/** The handler for a request, or null when the demo leaves it to the server */
export function matchDemoRoute(method: string, path: string): { handler: Handler; params: Record<string, string> } | null {
  for (const route of compiled) {
    if (route.method !== method) continue;
    const match = route.regex.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.names.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });
    return { handler: route.handler, params };
  }
  return null;
}

/** Photo address for the demo's example and uploaded photos */
export function demoPhotoUrl(photoId: number): string | null {
  return demoState().photos.find((p) => p.id === photoId)?.url ?? null;
}
