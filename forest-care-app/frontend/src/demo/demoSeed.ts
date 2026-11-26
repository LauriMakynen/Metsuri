import type { GeoJSONGeometry } from '../types';
import { calculateAreaHa } from '../utils/measurement';
import { DEMO_USER } from './demoMode';
import type {
  DemoBid,
  DemoChat,
  DemoForumPost,
  DemoForumThread,
  DemoMarking,
  DemoMessage,
  DemoNotification,
  DemoPhoto,
  DemoProperty,
  DemoState,
  DemoUser,
  DemoWorkRequest,
} from './demoStore';

// Example data the demo starts from: two parcels of a forest owner with done works, own work
// requests with offers and conversations, other owners' requests to offer on, and a forum.
// Times are relative to when the demo is opened, so the data always looks current.

const ME = DEMO_USER.id;
// Work providers who offer on the demo owner's requests
const METSAPALVELU = 900101;
const PUU_MAKINEN = 900102;
const RAIVAUS_VIRTANEN = 900103;
const METSAPOJAT = 900104;
// Other forest owners whose requests the demo user can offer on
const OWNER_SAVO = 900201;
const OWNER_HAME = 900202;
const OWNER_KARJALA = 900203;
// Forum writers
const KALLE = 900301;
const MAIJA = 900302;
const NEUVOJA = 900303;

const USERS: DemoUser[] = [
  { id: ME, email: DEMO_USER.email, name: 'Demometsuri' },
  { id: METSAPALVELU, email: 'tarjoukset@metsapalvelu.example', name: 'Keski-Suomen Metsäpalvelu' },
  { id: PUU_MAKINEN, email: 'puukauppa@puumakinen.example', name: 'Puu-Mäkinen Oy' },
  { id: RAIVAUS_VIRTANEN, email: 'raivaus.virtanen@example.com', name: 'Raivaus Virtanen' },
  { id: METSAPOJAT, email: 'info@metsapojat.example', name: 'Metsäpojat Ky' },
  { id: OWNER_SAVO, email: 'savon.metsanomistaja@example.com', name: 'Mäntymaan tila' },
  { id: OWNER_HAME, email: 'hameen.metsat@example.com', name: 'Hämeen metsänomistaja' },
  { id: OWNER_KARJALA, email: 'karjalan.palsta@example.com', name: 'Karjalan palsta' },
  { id: KALLE, email: 'kalle@example.com', name: 'Kuusikon Kalle' },
  { id: MAIJA, email: 'maija@example.com', name: 'Metsä-Maija' },
  { id: NEUVOJA, email: 'neuvoja@example.com', name: 'Metsäneuvoja Pekka' },
];

// Real all-forest parcel in Jämsä with no fields in Ruokavirasto's register
const HOME_FOREST: GeoJSONGeometry = {
  type: 'Polygon',
  coordinates: [[
    [25.118758, 62.087909],
    [25.110659, 62.08661],
    [25.109559, 62.088086],
    [25.11714, 62.090208],
    [25.118758, 62.087909],
  ]],
};

// Neighbouring parcel of three parts (palstat), a few hundred metres to the east
const LAKE_FOREST: GeoJSONGeometry = {
  type: 'MultiPolygon',
  coordinates: [
    [[[25.135246, 62.088513], [25.135627, 62.088067], [25.135727, 62.087897], [25.135612, 62.087947], [25.134716, 62.088431], [25.135246, 62.088513]]],
    [[[25.125709, 62.083948], [25.130731, 62.084752], [25.127831, 62.087348], [25.129903, 62.08767], [25.131182, 62.087868], [25.134452, 62.088392], [25.135237, 62.087988], [25.135649, 62.087752], [25.137115, 62.086064], [25.137748, 62.085439], [25.136998, 62.085105], [25.137326, 62.084916], [25.138096, 62.085079], [25.138242, 62.084929], [25.138556, 62.084617], [25.137101, 62.084513], [25.136209, 62.08327], [25.13686, 62.08278], [25.13704, 62.082646], [25.137771, 62.082716], [25.137574, 62.083225], [25.138292, 62.08367], [25.13922, 62.083929], [25.139671, 62.083376], [25.13844, 62.083002], [25.138904, 62.082679], [25.138727, 62.08262], [25.135552, 62.081522], [25.134479, 62.080267], [25.133107, 62.079815], [25.129532, 62.078635], [25.125553, 62.079259], [25.125535, 62.079235], [25.124973, 62.078475], [25.121955, 62.078617], [25.118385, 62.077355], [25.11494, 62.082223], [25.125709, 62.083948]]],
    [[[25.135727, 62.087897], [25.137051, 62.087793], [25.137709, 62.087728], [25.138001, 62.087699], [25.138289, 62.08726], [25.13719, 62.086287], [25.135887, 62.087799], [25.135727, 62.087897]]],
  ],
};

/** Axis-aligned rectangle from its south-west corner */
function rect(west: number, south: number, east: number, north: number): GeoJSONGeometry {
  return {
    type: 'Polygon',
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

/** Square of about `sizeM` metres around a point */
function square(lng: number, lat: number, sizeM: number): GeoJSONGeometry {
  const dLat = sizeM / 2 / 111_320;
  const dLng = sizeM / 2 / (111_320 * Math.cos((lat * Math.PI) / 180));
  return rect(lng - dLng, lat - dLat, lng + dLng, lat + dLat);
}

function area(geometry: GeoJSONGeometry): number | null {
  const ha = calculateAreaHa(geometry);
  return ha === null ? null : Math.round(ha * 100) / 100;
}

export function createDemoSeed(now: Date): DemoState {
  const ago = (days: number, hours = 0) =>
    new Date(now.getTime() - (days * 24 + hours) * 3_600_000).toISOString();
  const dateAgo = (days: number) => ago(days).slice(0, 10);

  // --- Parcels ----------------------------------------------------------------------------
  const HOME = 101;
  const LAKE = 102;
  const property = (p: Omit<DemoProperty, 'user_id' | 'source' | 'field_stand_ids' | 'manual' | 'updated_at'>): DemoProperty => ({
    ...p,
    user_id: ME,
    source: 'manual',
    field_stand_ids: [],
    manual: null,
    updated_at: p.created_at,
  });
  const properties: DemoProperty[] = [
    property({
      id: HOME, name: 'Kotimetsä', property_code: null, area_ha: 9.97, geometry: HOME_FOREST,
      region_code: '13', created_at: ago(420),
    }),
    property({
      id: LAKE, name: 'Järvenrannan palsta', property_code: null, area_ha: 75.03, geometry: LAKE_FOREST,
      region_code: '13', created_at: ago(380),
    }),
  ];

  // --- Done works (markings) ----------------------------------------------------------------
  const marking = (m: Omit<DemoMarking, 'user_id' | 'created_at' | 'updated_at' | 'area_ha'> & { area_ha?: number | null }): DemoMarking => ({
    ...m,
    area_ha: m.area_ha === undefined ? (m.geometry_type === 'area' ? area(m.geometry) : null) : m.area_ha,
    user_id: ME,
    created_at: `${m.operation_date ?? dateAgo(30)}T12:00:00.000Z`,
    updated_at: `${m.operation_date ?? dateAgo(30)}T12:00:00.000Z`,
  });
  const markings: DemoMarking[] = [
    marking({
      id: 201, property_id: HOME, type: 'harvennus', geometry_type: 'area',
      title: 'Ensiharvennus, kuusikko', description: 'Harvennettu kuitupuuleimikkona. Ajourat 20 m välein.',
      geometry: rect(25.11071, 62.08729, 25.11301, 62.08809),
      operation_date: '2025-10-14', follow_up_date_start: '2030-10-14', follow_up_date_end: '2035-10-14',
      follow_up_note: 'Tarkista puuston kehitys ja toisen harvennuksen tarve 5–10 vuoden kuluttua.',
      income_eur: 3650, cost_eur: null,
    }),
    marking({
      id: 202, property_id: HOME, type: 'vesakonhoito', geometry_type: 'area',
      title: 'Taimikon vesakonhoito', description: 'Koivuvesakko raivattu kuusentaimien ympäriltä.',
      geometry: rect(25.11376, 62.08756, 25.11548, 62.08818),
      operation_date: '2026-06-02', follow_up_date_start: '2028-06-02', follow_up_date_end: '2029-06-02',
      follow_up_note: 'Tarkista vesojen uusiutuminen 2–3 vuoden kuluttua.',
      income_eur: null, cost_eur: 420,
    }),
    marking({
      id: 203, property_id: HOME, type: 'istutus', geometry_type: 'point',
      title: 'Täydennysistutus', description: '300 kuusen paakkutainta aukkopaikkoihin.',
      geometry: { type: 'Point', coordinates: [25.1162, 62.0893] },
      operation_date: '2026-05-20', follow_up_date_start: '2027-05-20', follow_up_date_end: '2028-05-20',
      follow_up_note: 'Tarkista taimien eloonjäänti ja täydennysistutustarve.',
      income_eur: null, cost_eur: 310,
    }),
    marking({
      id: 204, property_id: HOME, type: 'muu_tyo', geometry_type: 'note',
      title: 'Riistakamera ja nuolukivi', description: 'Riistakamera kuusen rungossa, patterit vaihdettu syyskuussa.',
      geometry: { type: 'Point', coordinates: [25.1125, 62.0884] },
      operation_date: dateAgo(70), follow_up_date_start: null, follow_up_date_end: null, follow_up_note: null,
      income_eur: null, cost_eur: null,
    }),
    marking({
      id: 211, property_id: LAKE, type: 'avohakkuu', geometry_type: 'area',
      title: 'Päätehakkuu, varttunut kuusikko', description: 'Hakkuu ja kuljetus pystykaupalla.',
      geometry: rect(25.1200, 62.0790, 25.1228, 62.0801),
      operation_date: '2019-02-15', follow_up_date_start: '2019-06-01', follow_up_date_end: '2020-06-01',
      follow_up_note: 'Maanmuokkaus ja uudistaminen viimeistään seuraavana kesänä.',
      income_eur: 28400, cost_eur: null,
    }),
    marking({
      id: 212, property_id: LAKE, type: 'istutus', geometry_type: 'area',
      title: 'Kuusen istutus hakkuualalle', description: 'Laikutus ja 1 900 kuusentainta hehtaarille.',
      geometry: rect(25.1200, 62.0790, 25.1228, 62.0801),
      operation_date: '2020-05-25', follow_up_date_start: '2021-05-25', follow_up_date_end: '2022-05-25',
      follow_up_note: 'Tarkista taimien eloonjäänti ja heinän kilpailu.',
      income_eur: null, cost_eur: 1350,
    }),
    marking({
      id: 213, property_id: LAKE, type: 'harvennus', geometry_type: 'area',
      title: 'Harvennushakkuu, männikkö', description: 'Toinen harvennus, tukki- ja kuitupuuta.',
      geometry: rect(25.1280, 62.0830, 25.1308, 62.0841),
      operation_date: '2023-01-18', follow_up_date_start: '2033-01-18', follow_up_date_end: '2038-01-18',
      follow_up_note: 'Seuraa puuston kehitystä; päätehakkuu ajankohtainen noin 15–20 vuoden kuluttua.',
      income_eur: 9800, cost_eur: null,
    }),
    marking({
      id: 214, property_id: LAKE, type: 'muu_tyo', geometry_type: 'line',
      title: 'Metsäautotien kunnostus', description: 'Murske ja rummun vaihto, 400 m.',
      geometry: { type: 'LineString', coordinates: [[25.1170, 62.0800], [25.1205, 62.0812], [25.1240, 62.0822]] },
      area_ha: null,
      operation_date: '2024-08-12', follow_up_date_start: '2027-08-12', follow_up_date_end: '2029-08-12',
      follow_up_note: 'Tarkista tien kunto ja rumpujen toimivuus.',
      income_eur: null, cost_eur: 2100,
    }),
  ];

  // --- Work requests ------------------------------------------------------------------------
  const homeGeometry = HOME_FOREST;
  const request = (r: Omit<DemoWorkRequest, 'area_ha' | 'updated_at'> & { area_ha?: number | null }): DemoWorkRequest => ({
    ...r,
    area_ha: r.area_ha === undefined ? (r.geometry?.type === 'Point' ? null : area(r.geometry)) : r.area_ha,
    updated_at: r.created_at,
  });
  const THINNING = 301; // own, timber sale, three offers
  const SAPLINGS = 302; // own, service, counter-offer waiting
  const REPLANTING = 303; // own, closed with an accepted offer
  const SAVO_SAPLINGS = 311; // other owner; the demo user has offered on it
  const HAME_FINAL = 312;
  const KARJALA_ROAD = 313;
  const SAVO_THINNING = 314;
  const PIRKANMAA_PLANTING = 315;
  const LAPPI_THINNING = 316;
  const workRequests: DemoWorkRequest[] = [
    request({
      id: THINNING, user_id: ME, property_id: HOME, type: 'harvennus', title: 'Ensiharvennus, kuusikko',
      geometry: rect(25.1150, 62.0884, 25.1170, 62.0891),
      note: 'Kuusikko n. 30 v. Leimikolle hyvä kesä- ja talvikorjuukelpoinen yhteys tieltä.',
      pricing: 'owner_receives', target_price_eur: 5500, status: 'open', region_code: '13',
      property_geometry: homeGeometry, property_area_ha: 9.97, created_at: ago(6),
    }),
    request({
      id: SAPLINGS, user_id: ME, property_id: LAKE, type: 'vesakonhoito', title: 'Taimikonhoito, kuusentaimikko',
      geometry: rect(25.1320, 62.0810, 25.1348, 62.0821),
      note: 'Koivua ja haapaa kuusentaimien seassa. Työ mieluiten ennen juhannusta.',
      pricing: 'owner_pays', target_price_eur: 750, status: 'open', region_code: '13',
      property_geometry: LAKE_FOREST, property_area_ha: 75.03, created_at: ago(11),
    }),
    request({
      id: REPLANTING, user_id: ME, property_id: LAKE, type: 'istutus', title: 'Täydennysistutus hakkuualalle',
      geometry: rect(25.1220, 62.0800, 25.1248, 62.0811),
      note: 'Noin 400 tainta aukkopaikkoihin.',
      pricing: 'owner_pays', target_price_eur: 900, status: 'closed', region_code: '13',
      property_geometry: LAKE_FOREST, property_area_ha: 75.03, created_at: ago(48),
    }),
    request({
      id: SAVO_SAPLINGS, user_id: OWNER_SAVO, property_id: null, type: 'vesakonhoito', title: 'Taimikonhoito, rauduskoivikko',
      geometry: square(27.402, 62.951, 160),
      note: 'Rauduskoivun istutustaimikko, tiheä vesakko. Tie vie palstan reunaan.',
      pricing: 'owner_pays', target_price_eur: 950, status: 'open', region_code: '11',
      property_geometry: square(27.402, 62.951, 420), property_area_ha: 17.6, created_at: ago(9),
    }),
    request({
      id: HAME_FINAL, user_id: OWNER_HAME, property_id: null, type: 'avohakkuu', title: 'Päätehakkuu, varttunut kuusikko',
      geometry: square(24.461, 60.993, 180),
      note: 'Kuusikko 85 v., arviolta 900 m³. Talvikorjuu.',
      pricing: 'owner_receives', target_price_eur: 32000, status: 'open', region_code: '05',
      property_geometry: square(24.461, 60.993, 500), property_area_ha: 24.1, created_at: ago(4),
    }),
    request({
      id: KARJALA_ROAD, user_id: OWNER_KARJALA, property_id: null, type: 'muu_tyo', title: 'Metsäautotien rummun vaihto',
      geometry: { type: 'Point', coordinates: [29.761, 62.602] },
      note: 'Rumpu painunut, vesi nousee tielle keväisin.',
      pricing: 'owner_pays', target_price_eur: 1500, status: 'open', region_code: '12',
      property_geometry: square(29.761, 62.602, 450), property_area_ha: 21.3, created_at: ago(2),
    }),
    request({
      id: SAVO_THINNING, user_id: OWNER_SAVO, property_id: null, type: 'harvennus', title: 'Ensiharvennus, männikkö',
      geometry: square(27.27, 61.69, 200),
      note: 'Mäntytaimikko n. 25 v., kuivahko kangas.',
      pricing: 'owner_receives', target_price_eur: 3800, status: 'open', region_code: '10',
      property_geometry: square(27.27, 61.69, 520), property_area_ha: 27.0, created_at: ago(14),
    }),
    request({
      id: PIRKANMAA_PLANTING, user_id: OWNER_HAME, property_id: null, type: 'istutus', title: 'Kuusentaimien istutus',
      geometry: square(24.357, 61.677, 130),
      note: 'Muokattu ala, taimet tilattu valmiiksi.',
      pricing: 'owner_pays', target_price_eur: 1400, status: 'open', region_code: '06',
      property_geometry: square(24.357, 61.677, 400), property_area_ha: 16.0, created_at: ago(20),
    }),
    request({
      id: LAPPI_THINNING, user_id: OWNER_KARJALA, property_id: null, type: 'harvennus', title: 'Harvennushakkuu, kuivahko kangas',
      geometry: square(25.72, 66.5, 260),
      note: 'Männikkö, korjuu talvella jäätyneellä maalla.',
      pricing: 'owner_receives', target_price_eur: 9000, status: 'open', region_code: '19',
      property_geometry: square(25.72, 66.5, 700), property_area_ha: 49.0, created_at: ago(27),
    }),
  ];

  const photos: DemoPhoto[] = [
    { id: 401, work_request_id: THINNING, url: '/media/owner-card.jpg', taken_at: ago(7), created_at: ago(6) },
    { id: 402, work_request_id: THINNING, url: '/media/start-hero.jpg', taken_at: ago(7), created_at: ago(6) },
    { id: 403, work_request_id: SAPLINGS, url: '/media/login-forest.jpg', taken_at: ago(12), created_at: ago(11) },
    { id: 404, work_request_id: HAME_FINAL, url: '/media/provider-card.jpg', taken_at: null, created_at: ago(4) },
    { id: 405, work_request_id: SAVO_SAPLINGS, url: '/media/forum-card.jpg', taken_at: ago(10), created_at: ago(9) },
  ];

  // --- Offers and conversations -------------------------------------------------------------
  const bids: DemoBid[] = [
    { id: 501, work_request_id: THINNING, user_id: METSAPALVELU, amount_eur: 5200, status: 'pending', created_at: ago(5, 4) },
    { id: 502, work_request_id: THINNING, user_id: PUU_MAKINEN, amount_eur: 5750, status: 'pending', created_at: ago(1, 3) },
    { id: 503, work_request_id: THINNING, user_id: METSAPOJAT, amount_eur: 4900, status: 'pending', created_at: ago(3, 2) },
    { id: 504, work_request_id: SAPLINGS, user_id: METSAPALVELU, amount_eur: 690, status: 'pending', created_at: ago(9) },
    { id: 505, work_request_id: SAPLINGS, user_id: RAIVAUS_VIRTANEN, amount_eur: 780, status: 'pending', created_at: ago(8) },
    { id: 506, work_request_id: REPLANTING, user_id: RAIVAUS_VIRTANEN, amount_eur: 860, status: 'accepted', created_at: ago(45) },
    { id: 507, work_request_id: SAVO_SAPLINGS, user_id: ME, amount_eur: 920, status: 'pending', created_at: ago(7) },
    { id: 508, work_request_id: SAVO_SAPLINGS, user_id: METSAPOJAT, amount_eur: 880, status: 'pending', created_at: ago(5) },
    { id: 509, work_request_id: HAME_FINAL, user_id: PUU_MAKINEN, amount_eur: 33400, status: 'pending', created_at: ago(3) },
    { id: 510, work_request_id: HAME_FINAL, user_id: METSAPALVELU, amount_eur: 34800, status: 'pending', created_at: ago(2) },
    { id: 511, work_request_id: PIRKANMAA_PLANTING, user_id: RAIVAUS_VIRTANEN, amount_eur: 1350, status: 'pending', created_at: ago(18) },
    { id: 512, work_request_id: KARJALA_ROAD, user_id: METSAPOJAT, amount_eur: 1450, status: 'pending', created_at: ago(1) },
  ];

  const chat = (id: number, bid: DemoBid, ownerId: number): DemoChat => ({
    id, work_request_id: bid.work_request_id, owner_id: ownerId, provider_id: bid.user_id, bid_id: bid.id,
    owner_deleted: false, provider_deleted: false, created_at: bid.created_at,
  });
  const chats: DemoChat[] = [
    chat(601, bids[0], ME),
    chat(602, bids[1], ME),
    chat(603, bids[2], ME),
    chat(604, bids[3], ME),
    chat(605, bids[4], ME),
    chat(606, bids[5], ME),
    chat(607, bids[6], OWNER_SAVO),
  ];

  let messageId = 700;
  const msg = (
    chatId: number,
    senderId: number,
    createdAt: string,
    body: string | null,
    extra: Partial<Pick<DemoMessage, 'counter_offer_eur' | 'counter_offer_status' | 'read_at'>> = {}
  ): DemoMessage => ({
    id: ++messageId, chat_id: chatId, sender_id: senderId, body, image_base64: null, image_type: null,
    counter_offer_eur: null, counter_offer_status: null,
    read_at: senderId === ME ? null : createdAt,
    created_at: createdAt,
    ...extra,
  });
  const messages: DemoMessage[] = [
    msg(601, METSAPALVELU, ago(5, 4), 'Hei! Kävin katsomassa kuvion. Tarjoamme 5 200 €, korjuu onnistuu syyskuussa.'),
    msg(601, ME, ago(5, 1), 'Kiitos tarjouksesta! Sisältääkö hinta ajouraverkoston suunnittelun?'),
    msg(601, METSAPALVELU, ago(4, 20), 'Sisältää. Lisäksi kuljetus tienvarteen kuuluu hintaan.'),
    msg(602, PUU_MAKINEN, ago(1, 3), 'Päivää. Meillä on kalusto lähistöllä ensi kuussa, joten voimme tarjota 5 750 €.'),
    msg(602, PUU_MAKINEN, ago(0, 5), 'Ehtisittekö käydä leimikon läpi kanssamme ensi viikolla?', { read_at: null }),
    msg(604, METSAPALVELU, ago(9), 'Teemme taimikonhoidon raivaussahalla, valmista kesäkuun alussa.'),
    msg(605, RAIVAUS_VIRTANEN, ago(8), 'Hei, tiheän vesakon takia hinta on vähän tavoitettasi korkeampi.'),
    msg(605, RAIVAUS_VIRTANEN, ago(0, 9), null, { counter_offer_eur: 740, counter_offer_status: 'pending', read_at: null }),
    msg(606, RAIVAUS_VIRTANEN, ago(45), 'Voimme istuttaa taimet toukokuun puolivälissä.'),
    msg(606, ME, ago(44), 'Tarjous 860 € hyväksytty.'),
    msg(606, RAIVAUS_VIRTANEN, ago(30), 'Taimet istutettu, kiitos kaupoista!'),
    msg(607, OWNER_SAVO, ago(6), 'Kiitos tarjouksesta! Ehdittekö tehdä työn ennen syyskuuta?'),
  ];

  // --- Notifications ------------------------------------------------------------------------
  const notifications: DemoNotification[] = [
    {
      id: 801, type: 'chat_message', title: 'Uusi tarjous 740 € työpyyntöön Taimikonhoito, kuusentaimikko',
      body: 'Uusi tarjous on tullut chattiin.', link: '/chat/605', read_at: null, created_at: ago(0, 9),
    },
    {
      id: 802, type: 'chat_message', title: 'Uusi chat-viesti',
      body: 'Uusi viesti työpyyntöön Ensiharvennus, kuusikko.', link: '/chat/602', read_at: null, created_at: ago(0, 5),
    },
    {
      id: 803, type: 'new_bid', title: 'Uusi tarjous 5 750 € työpyyntöön Ensiharvennus, kuusikko',
      body: 'Työpyyntöösi on tullut uusi tarjous.', link: `/map?workRequest=${THINNING}`, read_at: null, created_at: ago(1, 3),
    },
    {
      id: 804, type: 'bid_no_longer_best', title: 'Työpyyntöön Taimikonhoito, rauduskoivikko tuli parempi tarjous',
      body: 'Oma tarjouksesi ei ole enää paras.', link: `/tyontarjoajat?workRequest=${SAVO_SAPLINGS}`,
      read_at: ago(4), created_at: ago(5),
    },
    {
      id: 805, type: 'new_bid', title: 'Uusi tarjous 780 € työpyyntöön Taimikonhoito, kuusentaimikko',
      body: 'Työpyyntöösi on tullut uusi tarjous.', link: `/map?workRequest=${SAPLINGS}`, read_at: ago(7), created_at: ago(8),
    },
  ];

  // --- Forum --------------------------------------------------------------------------------
  const thread = (t: DemoForumThread) => t;
  const forumThreads: DemoForumThread[] = [
    thread({ id: 901, user_id: KALLE, title: 'Milloin taimikonhoito kannattaa tehdä?', category: 'metsanhoito', created_at: ago(12) }),
    thread({ id: 902, user_id: MAIJA, title: 'Kuitupuun hinnat tänä syksynä', category: 'puukauppa', created_at: ago(8) }),
    thread({ id: 903, user_id: NEUVOJA, title: 'Kirjanpainajatuhoja Keski-Suomessa', category: 'tuhot', created_at: ago(5) }),
    thread({ id: 904, user_id: ME, title: 'Kokemuksia harvennusurakoitsijoista?', category: 'urakointi', created_at: ago(3) }),
    thread({ id: 905, user_id: MAIJA, title: 'Vinkkejä Metsurin GPS-aktiviteettiin', category: 'yleinen', created_at: ago(2) }),
    thread({ id: 906, user_id: KALLE, title: 'Lannoitus kivennäismailla – kannattaako?', category: 'metsanhoito', created_at: ago(1) }),
  ];
  let postId = 950;
  const post = (threadId: number, userId: number, createdAt: string, body: string): DemoForumPost => ({
    id: ++postId, thread_id: threadId, user_id: userId,
    author_name: USERS.find((u) => u.id === userId)?.name ?? 'Nimetön', body, created_at: createdAt, reported: false,
  });
  const forumPosts: DemoForumPost[] = [
    post(901, KALLE, ago(12), 'Istutin kuusta kolme vuotta sitten ja koivua alkaa nousta joka puolelta. Onko nyt oikea aika raivata vai odotanko vielä?'),
    post(901, NEUVOJA, ago(11, 20), 'Varhaisperkaus kannattaa tehdä, kun lehtipuut alkavat varjostaa taimia, yleensä 3–5 vuoden kuluttua istutuksesta. Alkukesä on hyvä aika, koska kannot vesovat silloin vähemmän.'),
    post(901, MAIJA, ago(10), 'Samaa mieltä. Itse merkitsin työn Metsuriin, niin sovellus muistuttaa tarkastuksesta parin vuoden päästä.'),
    post(901, KALLE, ago(9), 'Kiitos! Laitoin työpyynnön, tuli kaksi tarjousta jo päivässä.'),
    post(902, MAIJA, ago(8), 'Mitä hintoja teille on tarjottu kuusikuidusta? Meillä tarjous oli vähän alle 30 €/m³.'),
    post(902, KALLE, ago(7), 'Saman verran täällä. Tukin hinta on pysynyt hyvänä, kuitu heiluu enemmän.'),
    post(902, NEUVOJA, ago(6), 'Kannattaa pyytää tarjoukset useammalta ostajalta. Luken kantohintatilasto antaa hyvän vertailukohdan.'),
    post(903, NEUVOJA, ago(5), 'Kuivan kesän jälkeen kirjanpainajia on havaittu tavallista enemmän. Tarkistakaa erityisesti vanhojen kuusikoiden reunat ja tuulenkaadot.'),
    post(903, MAIJA, ago(4, 10), 'Löysin kolme kuolevaa kuusta hakkuuaukon reunasta. Merkitsin ne muistiinpanoksi kartalle.'),
    post(903, KALLE, ago(4), 'Tuhopuut kannattaa korjata pois ennen kesää, ettei kanta pääse kasvamaan.'),
    post(904, ME, ago(3), 'Laitoin ensiharvennuksesta työpyynnön ja sain kolme tarjousta. Millä perusteella te valitsette urakoitsijan, pelkän hinnan mukaan?'),
    post(904, NEUVOJA, ago(2, 12), 'Hinnan lisäksi kannattaa kysyä korjuuaika, ajouraväli ja miten leimikko merkitään. Hyvä urakoitsija kertoo nämä pyytämättä.'),
    post(905, MAIJA, ago(2), 'Huomasin, että aktiviteetti piirtää alueen kävelyreitistä. Kun kiertää kuvion reunat ensin, ala tulee tarkemmin.'),
    post(905, KALLE, ago(1, 6), 'Hyvä vinkki! Puhelimen GPS kannattaa päästää lämpenemään hetki ennen aloitusta.'),
    post(906, KALLE, ago(1), 'Onko kenelläkään kokemuksia kasvatuslannoituksesta kivennäismaalla? Kuinka nopeasti kasvu näkyy?'),
  ];

  return {
    version: 1,
    nextId: 5000,
    users: USERS,
    properties,
    markings,
    workRequests,
    photos,
    bids,
    chats,
    messages,
    notifications,
    forumThreads,
    forumPosts,
  };
}
