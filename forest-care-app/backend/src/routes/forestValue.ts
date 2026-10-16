import { Router, Request, Response } from 'express';
import { getDemoForestValue } from '../services/forestValue/forestValueService';

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

export default router;
