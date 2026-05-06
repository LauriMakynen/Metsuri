import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import {
  isValidPropertyCode,
  searchCadastreByPropertyCode,
  searchCadastreByCoordinates,
  CadastreApiNotConfiguredError,
} from '../services/cadastreService';

const router = Router();

router.use(authMiddleware);

router.get('/search/:propertyCode', async (req: AuthRequest, res: Response): Promise<void> => {
  const { propertyCode } = req.params;

  if (!isValidPropertyCode(propertyCode)) {
    res.status(400).json({ error: 'Kiinteistötunnus on väärässä muodossa (esim. 145-410-43-16)' });
    return;
  }

  try {
    const feature = await searchCadastreByPropertyCode(propertyCode);

    if (!feature) {
      res.status(404).json({ error: 'Kiinteistöä ei löytynyt annetulla tunnuksella' });
      return;
    }

    res.json(feature);
  } catch (error) {
    if (error instanceof CadastreApiNotConfiguredError) {
      res.status(503).json({ error: (error as Error).message });
      return;
    }
    console.error('Cadastre search error:', error);
    res.status(502).json({
      error: 'Kiinteistöhaku epäonnistui. Tarkista kiinteistötunnus tai MML-rajapinta-asetukset.',
    });
  }
});

// Search for a property by map coordinates (WGS84 lat/lng)
router.get('/at', async (req: AuthRequest, res: Response): Promise<void> => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng) || lat < 59 || lat > 71 || lng < 19 || lng > 32) {
    res.status(400).json({ error: 'Koordinaatit puuttuvat tai ovat Suomen alueen ulkopuolella' });
    return;
  }

  try {
    const feature = await searchCadastreByCoordinates(lat, lng);
    if (!feature) {
      res.status(404).json({ error: 'Kiinteistöä ei löytynyt kyseisessä sijainnissa' });
      return;
    }
    res.json(feature);
  } catch (error) {
    if (error instanceof CadastreApiNotConfiguredError) {
      res.status(503).json({ error: (error as Error).message });
      return;
    }
    console.error('Cadastre at-coordinate error:', error);
    res.status(502).json({ error: 'Kiinteistön haku epäonnistui' });
  }
});

export default router;
