import type { Marking, Property } from '../types';

// Example parcel and markings for guest demo mode. Never sent to the backend.

export const DEMO_PROPERTY_ID = -1;

const now = new Date().toISOString();

export const DEMO_PROPERTY: Property = {
  id: DEMO_PROPERTY_ID,
  name: 'Demopalsta (esimerkki)',
  property_code: null,
  source: 'demo',
  // Real all-forest property in Jämsä (182-423-5-63): no fields in Ruokavirasto's register
  area_ha: 9.97,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [25.118758, 62.087909],
      [25.110659, 62.08661],
      [25.109559, 62.088086],
      [25.11714, 62.090208],
      [25.118758, 62.087909],
    ]],
  },
  created_at: now,
};

export const DEMO_MARKINGS: Marking[] = [
  {
    id: -101,
    property_id: DEMO_PROPERTY_ID,
    type: 'harvennus',
    geometry_type: 'area',
    title: 'Ensiharvennus, kuusikko',
    description: 'Esimerkkimerkintä demoa varten.',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [25.11071, 62.08729],
        [25.11301, 62.08729],
        [25.11301, 62.08809],
        [25.11071, 62.08809],
        [25.11071, 62.08729],
      ]],
    },
    area_ha: 1.07,
    operation_date: '2025-10-14',
    follow_up_date_start: '2030-10-14',
    follow_up_date_end: '2035-10-14',
    follow_up_note: 'Tarkista puuston kehitys 5–10 vuoden kuluttua.',
    created_at: now,
    updated_at: now,
  },
  {
    id: -102,
    property_id: DEMO_PROPERTY_ID,
    type: 'vesakonhoito',
    geometry_type: 'area',
    title: 'Taimikon vesakonhoito',
    description: 'Esimerkkimerkintä demoa varten.',
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [25.11376, 62.08756],
        [25.11548, 62.08756],
        [25.11548, 62.08818],
        [25.11376, 62.08818],
        [25.11376, 62.08756],
      ]],
    },
    area_ha: 0.62,
    operation_date: '2026-06-02',
    follow_up_date_start: '2028-06-02',
    follow_up_date_end: '2029-06-02',
    follow_up_note: 'Tarkista vesojen uusiutuminen 2–3 vuoden kuluttua.',
    created_at: now,
    updated_at: now,
  },
  {
    id: -103,
    property_id: DEMO_PROPERTY_ID,
    type: 'istutus',
    geometry_type: 'point',
    title: 'Täydennysistutus',
    description: 'Esimerkkimerkintä demoa varten.',
    geometry: { type: 'Point', coordinates: [25.1162, 62.0893] },
    area_ha: null,
    operation_date: '2026-05-20',
    follow_up_date_start: '2027-05-20',
    follow_up_date_end: '2028-05-20',
    follow_up_note: 'Tarkista taimien kasvuunlähtö.',
    created_at: now,
    updated_at: now,
  },
];
