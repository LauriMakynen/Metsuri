import type { Marking, Property } from '../types';

// Example parcel and markings for guest demo mode. Never sent to the backend.

export const DEMO_PROPERTY_ID = -1;

const now = new Date().toISOString();

export const DEMO_PROPERTY: Property = {
  id: DEMO_PROPERTY_ID,
  name: 'Demopalsta (esimerkki)',
  property_code: null,
  source: 'demo',
  area_ha: 11.2,
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [25.0, 62.0],
      [25.0062, 61.9998],
      [25.0066, 62.0026],
      [25.0031, 62.0033],
      [24.9996, 62.0029],
      [25.0, 62.0],
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
        [25.0038, 62.0004],
        [25.0058, 62.0003],
        [25.006, 62.0016],
        [25.0041, 62.0018],
        [25.0038, 62.0004],
      ]],
    },
    area_ha: 1.52,
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
        [25.0004, 62.0019],
        [25.0022, 62.0018],
        [25.0024, 62.0027],
        [25.0003, 62.0026],
        [25.0004, 62.0019],
      ]],
    },
    area_ha: 0.9,
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
    geometry: { type: 'Point', coordinates: [25.0015, 62.0008] },
    area_ha: null,
    operation_date: '2026-05-20',
    follow_up_date_start: '2027-05-20',
    follow_up_date_end: '2028-05-20',
    follow_up_note: 'Tarkista taimien kasvuunlähtö.',
    created_at: now,
    updated_at: now,
  },
];
