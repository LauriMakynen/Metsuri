import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pool from './pool';

// Local test accounts with parcels, done work (markings) and open work requests with bids.
// Password for every account comes from SEED_PASSWORD in backend/.env (start.sh generates
// one if it is missing). Safe to run repeatedly: an owner's data is created only once.

type WorkType = 'vesakonhoito' | 'istutus' | 'harvennus' | 'avohakkuu' | 'muu_tyo';
type Geometry = { type: 'Polygon' | 'Point'; coordinates: unknown };

interface SeedMarking {
  type: WorkType;
  title: string;
  geometry: Geometry;
  areaHa: number | null;
  operationDate: string;
}

interface SeedRequest {
  type: WorkType;
  title: string;
  geometry: Geometry;
  note: string;
  targetPriceEur: number;
  bids?: { provider: string; amountEur: number }[];
}

interface SeedOwner {
  email: string;
  parcel: { name: string; areaHa: number; geometry: Geometry };
  markings: SeedMarking[];
  requests: SeedRequest[];
}

const PROVIDERS = ['yrittaja@metsuri.test', 'yrittaja2@metsuri.test'];

/** Rectangle of the given size (metres) centred on lng/lat. */
function rect(lng: number, lat: number, widthM: number, heightM: number): Geometry {
  const dLat = heightM / 2 / 111320;
  const dLng = widthM / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return {
    type: 'Polygon',
    coordinates: [[
      [lng - dLng, lat - dLat], [lng + dLng, lat - dLat], [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat], [lng - dLng, lat - dLat],
    ]],
  };
}

// Timber sales pay the owner; everything else is a service the owner pays for
function pricingFor(type: WorkType) {
  return type === 'avohakkuu' || type === 'harvennus' ? 'owner_receives' : 'owner_pays';
}

const OWNERS: SeedOwner[] = [
  {
    email: 'admin@metsuri.test',
    parcel: {
      name: 'Testipalsta',
      areaHa: 11.2,
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [25.0, 62.0], [25.0062, 61.9998], [25.0066, 62.0026],
          [25.0031, 62.0033], [24.9996, 62.0029], [25.0, 62.0],
        ]],
      },
    },
    markings: [
      {
        type: 'harvennus',
        title: 'Ensiharvennus, kuusikko',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [25.0038, 62.0004], [25.0058, 62.0003], [25.006, 62.0016],
            [25.0041, 62.0018], [25.0038, 62.0004],
          ]],
        },
        areaHa: 1.52,
        operationDate: '2025-10-14',
      },
      {
        type: 'vesakonhoito',
        title: 'Taimikon vesakonhoito',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [25.0004, 62.0019], [25.0022, 62.0018], [25.0024, 62.0027],
            [25.0003, 62.0026], [25.0004, 62.0019],
          ]],
        },
        areaHa: 0.9,
        operationDate: '2026-06-02',
      },
    ],
    requests: [
      {
        type: 'vesakonhoito',
        title: 'Taimikonhoito, eteläosa',
        geometry: rect(25.0018, 62.0006, 110, 90),
        note: 'Toive: syksy 2026. Tieyhteys hyvä.',
        targetPriceEur: 700,
        bids: [{ provider: 'yrittaja@metsuri.test', amountEur: 650 }],
      },
    ],
  },
  {
    email: 'omistaja2@metsuri.test',
    parcel: { name: 'Kuhmoisten palsta', areaHa: 24.0, geometry: rect(25.25, 61.62, 600, 400) },
    markings: [
      {
        type: 'istutus',
        title: 'Männyn istutus',
        geometry: rect(25.2535, 61.6215, 120, 90),
        areaHa: 1.1,
        operationDate: '2019-05-20',
      },
    ],
    requests: [
      {
        type: 'avohakkuu',
        title: 'Päätehakkuu, varttunut kuusikko',
        geometry: rect(25.247, 61.621, 200, 160),
        note: 'Leimikko valmis, talvikorjuu. Arvioitu kertymä n. 900 m³.',
        targetPriceEur: 18000,
        bids: [
          { provider: 'yrittaja@metsuri.test', amountEur: 18500 },
          { provider: 'yrittaja2@metsuri.test', amountEur: 19200 },
        ],
      },
      {
        type: 'istutus',
        title: 'Kuusentaimien istutus',
        geometry: rect(25.254, 61.619, 150, 120),
        note: 'Istutus keväällä 2027, n. 3 200 taimea.',
        targetPriceEur: 1600,
      },
      {
        type: 'muu_tyo',
        title: 'Metsäautotien rummun vaihto',
        geometry: { type: 'Point', coordinates: [25.2445, 61.6185] },
        note: 'Rumpu painunut, vaihto ennen talvikorjuuta.',
        targetPriceEur: 1500,
        bids: [{ provider: 'yrittaja2@metsuri.test', amountEur: 1450 }],
      },
    ],
  },
  {
    email: 'omistaja3@metsuri.test',
    parcel: { name: 'Rautavaaran metsä', areaHa: 31.5, geometry: rect(28.3, 63.49, 700, 450) },
    markings: [
      {
        type: 'vesakonhoito',
        title: 'Varhaishoito',
        geometry: rect(28.304, 63.4915, 140, 100),
        areaHa: 1.4,
        operationDate: '2024-07-10',
      },
    ],
    requests: [
      {
        type: 'harvennus',
        title: 'Ensiharvennus, männikkö',
        geometry: rect(28.296, 63.491, 240, 170),
        note: 'Kohde kantava myös kesällä.',
        targetPriceEur: 4500,
        bids: [{ provider: 'yrittaja2@metsuri.test', amountEur: 4800 }],
      },
      {
        type: 'vesakonhoito',
        title: 'Taimikonhoito, rauduskoivu',
        geometry: rect(28.305, 63.488, 180, 120),
        note: 'Tiheä vesakko, kiire ennen ensi kesää.',
        targetPriceEur: 850,
        bids: [
          { provider: 'yrittaja@metsuri.test', amountEur: 900 },
          { provider: 'yrittaja2@metsuri.test', amountEur: 780 },
        ],
      },
    ],
  },
];

async function upsertUser(email: string, passwordHash: string): Promise<number> {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, passwordHash]
  );
  return result.rows[0].id;
}

async function seedOwner(owner: SeedOwner, ownerId: number, providerIds: Record<string, number>) {
  const existing = await pool.query('SELECT id FROM properties WHERE user_id = $1 LIMIT 1', [ownerId]);
  if (existing.rows.length > 0) return;

  const property = await pool.query(
    `INSERT INTO properties (user_id, name, source, area_ha, geometry)
     VALUES ($1, $2, 'manual', $3, ST_GeomFromGeoJSON($4)) RETURNING id`,
    [ownerId, owner.parcel.name, owner.parcel.areaHa, JSON.stringify(owner.parcel.geometry)]
  );
  const propertyId = property.rows[0].id;

  for (const m of owner.markings) {
    await pool.query(
      `INSERT INTO markings (user_id, property_id, type, geometry_type, title, description, geometry,
                             area_ha, operation_date)
       VALUES ($1, $2, $3, $4, $5, 'Testidataa', ST_GeomFromGeoJSON($6), $7, $8)`,
      [
        ownerId, propertyId, m.type, m.geometry.type === 'Point' ? 'point' : 'area', m.title,
        JSON.stringify(m.geometry), m.areaHa, m.operationDate,
      ]
    );
  }

  for (const r of owner.requests) {
    const request = await pool.query(
      `INSERT INTO work_requests (user_id, property_id, type, title, geometry, area_ha, note, pricing, target_price_eur)
       VALUES ($1, $2, $3, $4, ST_GeomFromGeoJSON($5),
               CASE WHEN GeometryType(ST_GeomFromGeoJSON($5)) = 'POINT' THEN NULL
                    ELSE ROUND((ST_Area(ST_GeomFromGeoJSON($5)::geography) / 10000)::numeric, 2) END,
               $6, $7, $8)
       RETURNING id`,
      [ownerId, propertyId, r.type, r.title, JSON.stringify(r.geometry), r.note, pricingFor(r.type), r.targetPriceEur]
    );
    for (const bid of r.bids ?? []) {
      await pool.query(
        'INSERT INTO work_request_bids (work_request_id, user_id, amount_eur) VALUES ($1, $2, $3)',
        [request.rows[0].id, providerIds[bid.provider], bid.amountEur]
      );
    }
  }
}

async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('SEED_PASSWORD (min 8 merkkiä) puuttuu backend/.env-tiedostosta.');
  }
  const passwordHash = await bcrypt.hash(password, 10);

  const providerIds: Record<string, number> = {};
  for (const email of PROVIDERS) providerIds[email] = await upsertUser(email, passwordHash);

  for (const owner of OWNERS) {
    const ownerId = await upsertUser(owner.email, passwordHash);
    await seedOwner(owner, ownerId, providerIds);
  }

  const emails = [...OWNERS.map((o) => o.email), ...PROVIDERS];
  console.log(`Testitunnukset valmiina: ${emails.join(', ')} (salasana: SEED_PASSWORD backend/.env)`);
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
