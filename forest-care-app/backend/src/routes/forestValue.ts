import { Router, Request, Response } from 'express';
import {
  getDemoForestValue,
  getGuestForestValue,
  GuestParcelError,
} from '../services/forestValue/forestValueService';

const router = Router();

// GET /api/forest-value/demo - Forest value of the guest demo parcel (mock stands, no login)
router.get('/demo', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await getDemoForestValue());
  } catch (error) {
    console.error('Get demo forest value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/forest-value/guest - Value of a parcel a guest added in the demo (mock stands, no login).
// The parcel only exists in the guest's browser, so its geometry is sent in the request.
router.post('/guest', async (req: Request, res: Response): Promise<void> => {
  const { geometry, property_code } = req.body ?? {};
  try {
    res.json(await getGuestForestValue(geometry, typeof property_code === 'string' ? property_code : null));
  } catch (error) {
    if (error instanceof GuestParcelError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Get guest forest value error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
