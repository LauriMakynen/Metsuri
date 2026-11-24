import pool from './pool';
import { getFollowUpRecommendation, type BackendMarkingType } from '../services/followUpRecommendationService';

// Richer local test data on top of seed.ts: done work over several years (with income and costs
// for the return history), notes, work requests with bids, a chat with a counter offer,
// notifications and forum threads. Every shape is placed inside the owner's own parcel with
// PostGIS, so the data fits whichever forest the account has. Idempotent: rows are matched by
// title, so running the seed again adds only what is missing.

type WorkType = BackendMarkingType;

interface ExtraMarking {
  /** Index of the generated point inside the parcel; the same spot can carry several works */
  spot: number;
  /** Radius in metres for an area; omitted = a point */
  radiusM?: number;
  note?: boolean;
  type: WorkType;
  title: string;
  description: string;
  operationDate: string;
  incomeEur?: number;
  costEur?: number;
}

interface ExtraRequest {
  spot: number;
  radiusM?: number;
  type: WorkType;
  title: string;
  note: string;
  targetPriceEur: number;
  bids?: { provider: string; amountEur: number }[];
  /** Messages in the chat between the owner and this provider (counterOfferEur = a pending offer) */
  chat?: { provider: string; messages: { from: 'owner' | 'provider'; body?: string; counterOfferEur?: number }[] };
}

interface OwnerExtras {
  markings: ExtraMarking[];
  requests: ExtraRequest[];
}

/** Points generated inside each parcel; ST_GeneratePoints with a fixed seed is deterministic */
const SPOT_COUNT = 12;
const SPOT_SEED = 42;

const EXTRAS: Record<string, OwnerExtras> = {
  'admin@metsuri.test': {
    markings: [
      {
        spot: 0, radiusM: 55, type: 'avohakkuu', title: 'Päätehakkuu, pohjoisosa',
        description: 'Varttunut kuusikko, korjuu talvella.', operationDate: '2019-02-15', incomeEur: 24500,
      },
      {
        spot: 0, radiusM: 55, type: 'istutus', title: 'Kuusen istutus hakkuualalle',
        description: 'Laikkumätästys ja 1 800 kuusentaimea.', operationDate: '2020-05-20', costEur: 1400,
      },
      {
        spot: 0, radiusM: 55, type: 'vesakonhoito', title: 'Taimikon varhaishoito',
        description: 'Koivuvesakko raivattu taimien ympäriltä.', operationDate: '2023-06-12', costEur: 380,
      },
      {
        spot: 1, radiusM: 60, type: 'harvennus', title: 'Ensiharvennus, männikkö',
        description: 'Kuitupuuta noin 160 m³.', operationDate: '2024-01-25', incomeEur: 6200,
      },
      {
        spot: 2, type: 'muu_tyo', title: 'Metsäautotien rumpu uusittu',
        description: 'Painunut rumpu vaihdettu ennen syyssateita.', operationDate: '2025-09-03', costEur: 650,
      },
      {
        spot: 3, radiusM: 30, type: 'istutus', title: 'Täydennysistutus',
        description: 'Tuhoutuneiden taimien tilalle 300 taimea.', operationDate: '2025-05-28', costEur: 220,
      },
      {
        spot: 4, note: true, type: 'muu_tyo', title: 'Kaatunut kuusi ajouralla',
        description: 'Tuulenkaato syysmyrskyssä, sahattava ennen talvea.', operationDate: '2026-10-18',
      },
      {
        spot: 5, note: true, type: 'muu_tyo', title: 'Hirven syömiä männyntaimia',
        description: 'Latvavioituksia, tarkista tilanne keväällä.', operationDate: '2026-08-02',
      },
      {
        spot: 6, note: true, type: 'muu_tyo', title: 'Hyvä mustikkapaikka',
        description: 'Runsaasti mustikkaa heinäkuussa.', operationDate: '2026-07-20',
      },
    ],
    requests: [
      {
        spot: 7, radiusM: 50, type: 'vesakonhoito', title: 'Taimikonhoito, itäosa',
        note: 'Noin 10-vuotias kuusentaimikko, koivua seassa. Toive: syksy 2027.',
        targetPriceEur: 600,
        bids: [
          { provider: 'yrittaja@metsuri.test', amountEur: 560 },
          { provider: 'yrittaja2@metsuri.test', amountEur: 640 },
        ],
        chat: {
          provider: 'yrittaja@metsuri.test',
          messages: [
            { from: 'provider', body: 'Hei! Pääsisin tekemään taimikonhoidon lokakuun alussa. Onko palstalle hyvä tieyhteys?' },
            { from: 'owner', body: 'Hei, metsäautotie kulkee aivan palstan vierestä. Lokakuu sopii hyvin.' },
            { from: 'provider', body: 'Hyvä. Kun pääsen samalla reissulla naapuripalstalle, voin tehdä työn hieman edullisemmin.' },
            { from: 'provider', counterOfferEur: 520 },
          ],
        },
      },
      {
        spot: 8, radiusM: 70, type: 'harvennus', title: 'Harvennushakkuu, kuusikko',
        note: 'Toinen harvennus, arvioitu kertymä noin 250 m³. Talvikorjuu.',
        targetPriceEur: 9000,
        bids: [{ provider: 'yrittaja2@metsuri.test', amountEur: 9400 }],
      },
      {
        spot: 9, type: 'muu_tyo', title: 'Ojien perkaus',
        note: 'Kaksi sivuojaa umpeutunut, noin 300 metriä.',
        targetPriceEur: 1200,
      },
    ],
  },
  'omistaja2@metsuri.test': {
    markings: [
      {
        spot: 0, radiusM: 60, type: 'harvennus', title: 'Harvennus, eteläosa',
        description: 'Kuitu- ja pikkutukkia.', operationDate: '2021-02-10', incomeEur: 8300, costEur: 0,
      },
      {
        spot: 1, note: true, type: 'muu_tyo', title: 'Kirjanpainajatuhoja',
        description: 'Muutama kuollut kuusi, tarkista kesällä.', operationDate: '2026-06-15',
      },
    ],
    requests: [],
  },
  'omistaja3@metsuri.test': {
    markings: [
      {
        spot: 0, note: true, type: 'muu_tyo', title: 'Rajapyykki löytyi',
        description: 'Pyykki on kiven kyljessä polun varressa.', operationDate: '2026-05-09',
      },
    ],
    requests: [],
  },
};

/** Nickname shown in the forum and chat; only set when the account has none */
const DISPLAY_NAMES: Record<string, string> = {
  'admin@metsuri.test': 'Testiomistaja',
  'omistaja2@metsuri.test': 'Kuhmoisten Kalle',
  'omistaja3@metsuri.test': 'Rautavaaran Riitta',
  'yrittaja@metsuri.test': 'Metsäpalvelu Koivu',
  'yrittaja2@metsuri.test': 'Harvennus Oy',
};

const FORUM_THREADS: { title: string; posts: { author: string; body: string }[] }[] = [
  {
    title: 'Milloin taimikonhoito kannattaa tehdä?',
    posts: [
      { author: 'omistaja2@metsuri.test', body: 'Kuusentaimikossa on paljon koivua. Kannattaako raivata jo nyt syksyllä vai odottaa kevääseen?' },
      { author: 'yrittaja@metsuri.test', body: 'Syksy lehtien pudottua on hyvä aika: taimet näkyvät ja vesat eivät enää kasva samana vuonna.' },
      { author: 'admin@metsuri.test', body: 'Itse tein varhaishoidon kesäkuussa, ja hyvin onnistui. Tärkeintä, ettei taimikko pääse tukahtumaan.' },
    ],
  },
  {
    title: 'Kokemuksia hirvituhoista männyntaimikossa',
    posts: [
      { author: 'omistaja3@metsuri.test', body: 'Hirvet ovat syöneet latvoja lähes joka toisesta männyntaimesta. Onko kenelläkään kokemusta karkotteista?' },
      { author: 'admin@metsuri.test', body: 'Meillä samaa. Ajattelin istuttaa seuraavaksi kuusta, sitä hirvi ei yleensä syö.' },
    ],
  },
];

async function userId(email: string): Promise<number | null> {
  const r = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  return r.rows[0]?.id ?? null;
}

/** Shape SQL for a spot: a point, or a circle clipped to the parcel ($1 property, $2 spot, $3 radius) */
const SHAPE_SQL = `
  SELECT p.id AS property_id,
         CASE WHEN $3::float IS NULL THEN s.pt
              ELSE ST_CollectionExtract(ST_Intersection(ST_Buffer(s.pt::geography, $3::float)::geometry, p.geometry), 3)
         END AS shape
  FROM properties p
  CROSS JOIN LATERAL (
    SELECT ST_SetSRID(ST_GeometryN(ST_GeneratePoints(p.geometry, ${SPOT_COUNT}, ${SPOT_SEED}), $2::int + 1), ST_SRID(p.geometry)) AS pt
  ) s
  WHERE p.id = $1`;

async function seedMarkings(ownerId: number, propertyId: number, markings: ExtraMarking[]) {
  for (const m of markings) {
    const exists = await pool.query('SELECT 1 FROM markings WHERE property_id = $1 AND title = $2', [propertyId, m.title]);
    if (exists.rows.length > 0) continue;
    const followUp = m.note
      ? { followUpDateStart: null, followUpDateEnd: null, followUpNote: null }
      : getFollowUpRecommendation(m.type, m.operationDate);
    const geometryType = m.note ? 'note' : m.radiusM ? 'area' : 'point';
    await pool.query(
      `WITH shape AS (${SHAPE_SQL})
       INSERT INTO markings (user_id, property_id, type, geometry_type, title, description, geometry, area_ha,
                             operation_date, follow_up_date_start, follow_up_date_end, follow_up_note, income_eur, cost_eur)
       SELECT $4, property_id, $5, $6, $7, $8, shape,
              CASE WHEN $3::float IS NULL THEN NULL ELSE ROUND((ST_Area(shape::geography) / 10000)::numeric, 2) END,
              $9, $10, $11, $12, $13, $14
       FROM shape WHERE NOT ST_IsEmpty(shape)`,
      [
        propertyId, m.spot, m.radiusM ?? null, ownerId, m.type, geometryType, m.title, m.description,
        m.operationDate, followUp.followUpDateStart, followUp.followUpDateEnd, followUp.followUpNote,
        m.incomeEur ?? null, m.costEur ?? null,
      ]
    );
  }
}

async function seedRequests(ownerId: number, propertyId: number, requests: ExtraRequest[]) {
  for (const r of requests) {
    const existing = await pool.query(
      'SELECT id FROM work_requests WHERE user_id = $1 AND property_id = $2 AND title = $3',
      [ownerId, propertyId, r.title]
    );
    let requestId: number | undefined = existing.rows[0]?.id;
    if (!requestId) {
      const pricing = r.type === 'avohakkuu' || r.type === 'harvennus' ? 'owner_receives' : 'owner_pays';
      const inserted = await pool.query(
        `WITH shape AS (${SHAPE_SQL})
         INSERT INTO work_requests (user_id, property_id, type, title, geometry, area_ha, note, pricing, target_price_eur)
         SELECT $4, property_id, $5, $6, shape,
                CASE WHEN $3::float IS NULL THEN NULL ELSE ROUND((ST_Area(shape::geography) / 10000)::numeric, 2) END,
                $7, $8, $9
         FROM shape WHERE NOT ST_IsEmpty(shape)
         RETURNING id`,
        [propertyId, r.spot, r.radiusM ?? null, ownerId, r.type, r.title, r.note, pricing, r.targetPriceEur]
      );
      requestId = inserted.rows[0]?.id;
      if (!requestId) continue;
      for (const bid of r.bids ?? []) {
        const providerId = await userId(bid.provider);
        if (!providerId) continue;
        await pool.query(
          'INSERT INTO work_request_bids (work_request_id, user_id, amount_eur) VALUES ($1, $2, $3)',
          [requestId, providerId, bid.amountEur]
        );
        await pool.query(
          'INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)',
          [
            ownerId, 'new_bid', `Uusi tarjous ${bid.amountEur.toLocaleString('fi-FI')} € työpyyntöön ${r.title}`,
            'Työpyyntöösi on tullut uusi tarjous.', `/map?workRequest=${requestId}`,
          ]
        );
      }
    }
  }
}

async function seedChat(ownerId: number, requestId: number, chat: NonNullable<ExtraRequest['chat']>) {
  const providerId = await userId(chat.provider);
  if (!providerId) return;
  const chatRow = await pool.query(
    'SELECT id FROM work_request_chats WHERE work_request_id = $1 AND provider_id = $2 LIMIT 1',
    [requestId, providerId]
  );
  const chatId: number | undefined = chatRow.rows[0]?.id;
  if (!chatId) return;
  const hasMessages = await pool.query('SELECT 1 FROM chat_messages WHERE chat_id = $1 LIMIT 1', [chatId]);
  if (hasMessages.rows.length > 0) return;
  // Spread the messages over the last two days so the order and times look natural
  const total = chat.messages.length;
  for (const [i, msg] of chat.messages.entries()) {
    await pool.query(
      `INSERT INTO chat_messages (chat_id, sender_id, body, counter_offer_eur, counter_offer_status, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW() - make_interval(hours => $6))`,
      [
        chatId, msg.from === 'owner' ? ownerId : providerId, msg.body ?? null,
        msg.counterOfferEur ?? null, msg.counterOfferEur ? 'pending' : null, (total - i) * 6,
      ]
    );
  }
  const last = chat.messages[total - 1];
  if (last.from === 'provider') {
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, body, link) VALUES ($1, $2, $3, $4, $5)',
      [ownerId, 'chat_message', 'Uusi chat-viesti', 'Uusi viesti työpyyntöön.', `/chat/${chatId}`]
    );
  }
}

/** Every bid opens a chat in the app; older seed bids got none, so add the missing ones */
async function ensureBidChats() {
  await pool.query(
    `INSERT INTO work_request_chats (work_request_id, owner_id, provider_id, bid_id)
     SELECT b.work_request_id, r.user_id, b.user_id, b.id
     FROM work_request_bids b
     JOIN work_requests r ON r.id = b.work_request_id
     WHERE r.user_id <> b.user_id
       AND NOT EXISTS (SELECT 1 FROM work_request_chats c WHERE c.bid_id = b.id)`
  );
}

async function seedForum() {
  for (const [email, name] of Object.entries(DISPLAY_NAMES)) {
    await pool.query('UPDATE users SET display_name = $2 WHERE email = $1 AND display_name IS NULL', [email, name]);
  }
  for (const [t, thread] of FORUM_THREADS.entries()) {
    const exists = await pool.query('SELECT 1 FROM forum_threads WHERE title = $1', [thread.title]);
    if (exists.rows.length > 0) continue;
    const starter = await pool.query('SELECT id, display_name FROM users WHERE email = $1', [thread.posts[0].author]);
    if (!starter.rows[0]) continue;
    // Older threads first: thread t started (t + 1) days ago, replies a few hours apart
    const created = await pool.query(
      `INSERT INTO forum_threads (user_id, title, created_at, last_post_at)
       VALUES ($1, $2, NOW() - make_interval(days => $3), NOW() - make_interval(days => $3))
       RETURNING id`,
      [starter.rows[0].id, thread.title, FORUM_THREADS.length - t]
    );
    for (const [i, post] of thread.posts.entries()) {
      const author = await pool.query('SELECT id, display_name FROM users WHERE email = $1', [post.author]);
      if (!author.rows[0]) continue;
      await pool.query(
        `INSERT INTO forum_posts (thread_id, user_id, author_name, body, created_at)
         VALUES ($1, $2, $3, $4, NOW() - make_interval(days => $5) + make_interval(hours => $6))`,
        [created.rows[0].id, author.rows[0].id, author.rows[0].display_name ?? 'Metsänomistaja', post.body,
          FORUM_THREADS.length - t, i * 5]
      );
    }
    await pool.query(
      'UPDATE forum_threads SET last_post_at = (SELECT MAX(created_at) FROM forum_posts WHERE thread_id = $1) WHERE id = $1',
      [created.rows[0].id]
    );
  }
}

export async function seedExtras() {
  for (const [email, extras] of Object.entries(EXTRAS)) {
    const ownerId = await userId(email);
    if (!ownerId) continue;
    // The owner's first parcel is the one seed.ts manages
    const property = await pool.query('SELECT id FROM properties WHERE user_id = $1 ORDER BY id LIMIT 1', [ownerId]);
    const propertyId: number | undefined = property.rows[0]?.id;
    if (!propertyId) continue;
    await seedMarkings(ownerId, propertyId, extras.markings);
    await seedRequests(ownerId, propertyId, extras.requests);
  }
  await ensureBidChats();
  // Messages go into the chats opened above (one chat per bid)
  for (const [email, extras] of Object.entries(EXTRAS)) {
    const ownerId = await userId(email);
    if (!ownerId) continue;
    for (const r of extras.requests) {
      if (!r.chat) continue;
      const req = await pool.query('SELECT id FROM work_requests WHERE user_id = $1 AND title = $2 LIMIT 1', [ownerId, r.title]);
      if (req.rows[0]) await seedChat(ownerId, req.rows[0].id, r.chat);
    }
  }
  await seedForum();
}
