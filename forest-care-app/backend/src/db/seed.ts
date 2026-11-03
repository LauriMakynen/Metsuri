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
  legacyTitle?: string;
  bids?: { provider: string; amountEur: number }[];
}

interface SeedOwner {
  email: string;
  // propertyCode set = a real MML property (source 'cadastre'); otherwise a drawn example ('manual').
  // legacyNames: earlier seed versions of this parcel, moved here with their markings on the next seed run
  parcel: { name: string; areaHa: number; geometry: Geometry; propertyCode?: string; legacyNames?: string[] };
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
      // Real forest property in Jämsä, Keski-Suomi (MML 182-423-5-63): all forest, no fields in
      // Ruokavirasto's field register, covered by Metsäkeskus stands
      name: 'Testipalsta (Jämsä)',
      propertyCode: '182-423-5-63',
      areaHa: 9.97,
      legacyNames: ['Testipalsta', 'Testipalsta (Jämsä)'],
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [25.118758, 62.087909], [25.110659, 62.08661], [25.109559, 62.088086],
          [25.11714, 62.090208], [25.118758, 62.087909],
        ]],
      },
    },
    markings: [
      {
        type: 'harvennus',
        title: 'Ensiharvennus, kuusikko',
        geometry: rect(25.11186, 62.08769, 120, 90),
        areaHa: 1.08,
        operationDate: '2025-10-14',
      },
      {
        type: 'vesakonhoito',
        title: 'Taimikon vesakonhoito',
        geometry: rect(25.11462, 62.08787, 90, 70),
        areaHa: 0.63,
        operationDate: '2026-06-02',
      },
    ],
    requests: [
      {
        type: 'vesakonhoito',
        title: 'Taimikonhoito, eteläosa',
        geometry: rect(25.11692, 62.08823, 100, 70),
        note: 'Toive: syksy 2026. Tieyhteys hyvä.',
        targetPriceEur: 700,
        bids: [{ provider: 'yrittaja@metsuri.test', amountEur: 650 }],
      },
    ],
  },
  {
    email: 'omistaja2@metsuri.test',
    // Real forest property in Kuhmoinen (MML 291-410-10-52): no fields, 99 % Metsäkeskus stands
    parcel: {
      name: 'Kuhmoisten palsta',
      propertyCode: '291-410-10-52',
      areaHa: 25.06,
      legacyNames: ['Kuhmoisten palsta'],
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [25.120303, 61.624937], [25.111632, 61.622143], [25.106933, 61.626474], [25.11558, 61.627544],
          [25.11554, 61.627738], [25.116404, 61.627902], [25.116976, 61.627874], [25.117241, 61.627915],
          [25.120303, 61.624937],
        ]],
      },
    },
    markings: [
      {
        type: 'istutus',
        title: 'Männyn istutus',
        geometry: rect(25.11228, 61.62359, 120, 90),
        areaHa: 1.1,
        operationDate: '2019-05-20',
      },
    ],
    requests: [
      {
        type: 'avohakkuu',
        title: 'Päätehakkuu, varttunut kuusikko',
        geometry: rect(25.11161, 61.62503, 200, 160),
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
        geometry: rect(25.11562, 61.62474, 150, 120),
        note: 'Istutus keväällä 2027, n. 3 200 taimea.',
        targetPriceEur: 1600,
      },
      {
        type: 'muu_tyo',
        title: 'Metsäautotien rummun vaihto',
        geometry: { type: 'Point', coordinates: [25.11161, 61.62272] },
        note: 'Rumpu painunut, vaihto ennen talvikorjuuta.',
        targetPriceEur: 1500,
        bids: [{ provider: 'yrittaja2@metsuri.test', amountEur: 1450 }],
      },
      {
        type: 'muu_tyo',
        title: 'Sivuojarummun vaihto, Iisvedentie',
        legacyTitle: 'Rajalinjan raivaus, länsireuna',
        geometry: { type: 'Point', coordinates: [26.9024601, 62.7068409] },
        note: 'Iisvedentien sivuojarumpu on painunut ja tukkeutunut. Vaihdetaan rumpu ja varmistetaan veden esteetön kulku.',
        targetPriceEur: 500,
        bids: [{ provider: 'yrittaja@metsuri.test', amountEur: 460 }],
      },
      {
        type: 'muu_tyo',
        title: 'Tienvarsivesakon raivaus, Kuopiontie',
        legacyTitle: 'Metsäautotien lanaus ja sorastus',
        geometry: { type: 'Point', coordinates: [26.8341085, 62.6219351] },
        note: 'Raivataan Kuopiontien varresta näkyvyyttä haittaava vesakko. Työalue ja puuston käsittely sovitaan ennen työn aloitusta.',
        targetPriceEur: 900,
      },
    ],
  },
  {
    email: 'omistaja3@metsuri.test',
    // Real forest property in Rautavaara (MML 687-410-13-26): no fields, all Metsäkeskus stands.
    // The earlier example rectangle lay in the village centre.
    parcel: {
      name: 'Rautavaaran metsä',
      propertyCode: '687-410-13-26',
      areaHa: 34.98,
      legacyNames: ['Rautavaaran metsä'],
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [28.200755, 63.435386], [28.192586, 63.439504], [28.189375, 63.438972], [28.187942, 63.440699],
          [28.1896, 63.441023], [28.191625, 63.441588], [28.191849, 63.441481], [28.19722, 63.442588],
          [28.197029, 63.442779], [28.197383, 63.442858], [28.207629, 63.435849], [28.200755, 63.435386],
        ]],
      },
    },
    markings: [
      {
        type: 'vesakonhoito',
        title: 'Varhaishoito',
        geometry: rect(28.20172, 63.43651, 140, 100),
        areaHa: 1.4,
        operationDate: '2024-07-10',
      },
    ],
    requests: [
      {
        type: 'harvennus',
        title: 'Ensiharvennus, männikkö',
        geometry: rect(28.19975, 63.43837, 240, 170),
        note: 'Kohde kantava myös kesällä.',
        targetPriceEur: 4500,
        bids: [{ provider: 'yrittaja2@metsuri.test', amountEur: 4800 }],
      },
      {
        type: 'vesakonhoito',
        title: 'Taimikonhoito, rauduskoivu',
        geometry: rect(28.19582, 63.43987, 180, 120),
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

// An older seed parcel (e.g. one lying partly on a field) is replaced in place by the current
// one; its seed markings and requests move along so the example data stays on forest
async function moveLegacyParcel(owner: SeedOwner, propertyId: number) {
  await pool.query(
    `UPDATE properties SET name = $2, property_code = $3, source = 'cadastre', area_ha = $4,
                           geometry = ST_GeomFromGeoJSON($5)
     WHERE id = $1`,
    [propertyId, owner.parcel.name, owner.parcel.propertyCode, owner.parcel.areaHa, JSON.stringify(owner.parcel.geometry)]
  );
  for (const m of owner.markings) {
    await pool.query(
      'UPDATE markings SET geometry = ST_GeomFromGeoJSON($3), area_ha = $4 WHERE property_id = $1 AND title = $2',
      [propertyId, m.title, JSON.stringify(m.geometry), m.areaHa]
    );
  }
  for (const r of owner.requests) {
    await pool.query(
      `UPDATE work_requests
       SET geometry = ST_GeomFromGeoJSON($3),
           area_ha = CASE WHEN GeometryType(ST_GeomFromGeoJSON($3)) = 'POINT' THEN NULL
                          ELSE ROUND((ST_Area(ST_GeomFromGeoJSON($3)::geography) / 10000)::numeric, 2) END
       WHERE property_id = $1 AND title = $2`,
      [propertyId, r.title, JSON.stringify(r.geometry)]
    );
  }
  // The cached value and field marks refer to the old boundary's stands
  await pool.query('DELETE FROM forest_value_cache WHERE property_id = $1', [propertyId]);
  await pool.query('DELETE FROM forest_field_marks WHERE property_id = $1', [propertyId]);
  console.log(`Testipalsta siirretty: ${owner.email} → ${owner.parcel.propertyCode}`);
}

async function seedOwner(owner: SeedOwner, ownerId: number, providerIds: Record<string, number>) {
  // The oldest parcel is the one seed created; owners may have added their own parcels later
  const existing = await pool.query(
    'SELECT id, name, property_code FROM properties WHERE user_id = $1 ORDER BY id LIMIT 1',
    [ownerId]
  );
  let propertyId: number;
  if (existing.rows.length > 0) {
    propertyId = existing.rows[0].id;
    const { name, property_code: code } = existing.rows[0];
    if (owner.parcel.propertyCode && code !== owner.parcel.propertyCode && owner.parcel.legacyNames?.includes(name)) {
      await moveLegacyParcel(owner, propertyId);
    }
  } else {
    const property = await pool.query(
      `INSERT INTO properties (user_id, name, property_code, source, area_ha, geometry)
       VALUES ($1, $2, $3, $4, $5, ST_GeomFromGeoJSON($6)) RETURNING id`,
      [
        ownerId, owner.parcel.name, owner.parcel.propertyCode ?? null,
        owner.parcel.propertyCode ? 'cadastre' : 'manual', owner.parcel.areaHa, JSON.stringify(owner.parcel.geometry),
      ]
    );
    propertyId = property.rows[0].id;

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
  }

  for (const r of owner.requests) {
    const existingRequest = await pool.query(
      'SELECT id FROM work_requests WHERE user_id = $1 AND property_id = $2 AND title = ANY($3::text[]) LIMIT 1',
      [ownerId, propertyId, [r.title, ...(r.legacyTitle ? [r.legacyTitle] : [])]]
    );
    if (existingRequest.rows.length > 0) {
      if (r.legacyTitle) {
        await pool.query(
          `UPDATE work_requests
           SET title = $2, geometry = ST_GeomFromGeoJSON($3),
               area_ha = CASE WHEN GeometryType(ST_GeomFromGeoJSON($3)) = 'POINT' THEN NULL
                              ELSE ROUND((ST_Area(ST_GeomFromGeoJSON($3)::geography) / 10000)::numeric, 2) END,
               note = $4
           WHERE id = $1`,
          [
            existingRequest.rows[0].id,
            r.title,
            JSON.stringify(r.geometry),
            r.note,
          ]
        );
      }
      continue;
    }

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
