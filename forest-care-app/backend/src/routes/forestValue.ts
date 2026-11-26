import { Router, Request, Response } from 'express';
import {
  getDemoForestValue,
  getGuestForestValue,
  getGuestForestValueHistory,
  GuestParcelError,
  type GuestParcelOptions,
} from '../services/forestValue/forestValueService';
import { validateManualInput } from '../services/forestValue/manualStand';
import type { HistoryEvent } from '../services/forestValue/types';

const router = Router();

const MAX_FIELD_MARKS = 200;
const MAX_STAND_ID_LENGTH = 200;
const MAX_HISTORY_EVENTS = 500;
const MAX_EVENT_TITLE_LENGTH = 200;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class GuestInputError extends Error {}

// Field marks and owner-entered basics the demo keeps in the browser
function parseGuestOptions(body: Record<string, unknown>): GuestParcelOptions {
  const options: GuestParcelOptions = {};
  if (body.field_stand_ids !== undefined) {
    const ids = body.field_stand_ids;
    if (
      !Array.isArray(ids) ||
      ids.length > MAX_FIELD_MARKS ||
      ids.some((id) => typeof id !== 'string' || !id || id.length > MAX_STAND_ID_LENGTH)
    ) {
      throw new GuestInputError('field_stand_ids must be a list of stand ids');
    }
    options.fieldStandIds = ids as string[];
  }
  if (body.manual !== undefined && body.manual !== null) {
    const validated = validateManualInput(body.manual);
    if ('error' in validated) throw new GuestInputError(validated.error);
    options.manual = validated.value;
  }
  return options;
}

function toNullableEur(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new GuestInputError('incomeEur and costEur must be non-negative numbers');
  }
  return value;
}

// Done works of a guest parcel (the demo's markings) for the return history
function parseHistoryEvents(value: unknown): HistoryEvent[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_HISTORY_EVENTS) {
    throw new GuestInputError('events must be a list');
  }
  return value.map((event) => {
    const e = (event ?? {}) as Record<string, unknown>;
    if (
      typeof e.date !== 'string' || !ISO_DATE.test(e.date) ||
      typeof e.type !== 'string' || e.type.length > 50 ||
      typeof e.title !== 'string' || e.title.length > MAX_EVENT_TITLE_LENGTH
    ) {
      throw new GuestInputError('Invalid event');
    }
    return {
      date: e.date,
      type: e.type,
      title: e.title,
      incomeEur: toNullableEur(e.incomeEur),
      costEur: toNullableEur(e.costEur),
    };
  });
}

function sendGuestError(res: Response, error: unknown, label: string): void {
  if (error instanceof GuestParcelError || error instanceof GuestInputError) {
    res.status(400).json({ error: error.message });
    return;
  }
  console.error(`${label} error:`, error);
  res.status(500).json({ error: 'Internal server error' });
}

// GET /api/forest-value/demo - Forest value of the guest demo parcel (mock stands, no login)
router.get('/demo', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getDemoForestValue());
  } catch (error) {
    console.error('Get demo forest value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forest-value/guest - Value of a parcel in the demo (mock stands, no login).
// The parcel only exists in the guest's browser, so its geometry is sent in the request,
// optionally with stands marked as field (field_stand_ids) and owner-entered basics (manual).
router.post('/guest', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const options = parseGuestOptions(body);
    const propertyCode = typeof body.property_code === 'string' ? body.property_code : null;
    res.json(await getGuestForestValue(body.geometry, propertyCode, options));
  } catch (error) {
    sendGuestError(res, error, 'Get guest forest value');
  }
});

// POST /api/forest-value/guest/history - Return history of a demo parcel; the done works on it
// (events: date, type, title, incomeEur, costEur) are sent along like the geometry
router.post('/guest/history', async (req: Request, res: Response): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    const options = parseGuestOptions(body);
    const events = parseHistoryEvents(body.events);
    const propertyCode = typeof body.property_code === 'string' ? body.property_code : null;
    res.json(await getGuestForestValueHistory(body.geometry, propertyCode, options, events));
  } catch (error) {
    sendGuestError(res, error, 'Get guest forest value history');
  }
});

export default router;
