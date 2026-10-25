import { Router, Request, Response } from 'express';
import {
  isValidPropertyCode,
  searchCadastreByPropertyCode,
  searchCadastreByCoordinates,
  CadastreApiNotConfiguredError,
  CadastreUnavailableError,
} from '../services/cadastreService';

const router = Router();

// MML not configured or not answering: a clear 503 message the UI can show as is
function sendServiceError(res: Response, error: unknown): boolean {
  if (error instanceof CadastreApiNotConfiguredError || error instanceof CadastreUnavailableError) {
    res.status(503).json({ error: error.message });
    return true;
  }
  return false;
}

// Public: cadastre data is MML open data, and guests need it to try the demo on their own
// parcel. Abuse is limited by the cadastre rate limiter in index.ts.
router.get('/search/:propertyCode', async (req: Request, res: Response): Promise<void> => {
  const { propertyCode } = req.params;

  if (!isValidPropertyCode(propertyCode)) {
    res.status(400).json({ error: 'Kiinteistötunnus on väärässä muodossa (esim. 91-401-5-24)' });
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
    if (sendServiceError(res, error)) return;
    console.error('Cadastre search error:', error);
    res.status(502).json({ error: 'Kiinteistöhaku epäonnistui. Yritä hetken kuluttua uudelleen.' });
  }
});

// Search for a property by map coordinates (WGS84 lat/lng); returns the whole property
router.get('/at', async (req: Request, res: Response): Promise<void> => {
  const lat = parseFloat(req.query.lat as string);
  const lng = parseFloat(req.query.lng as string);

  if (isNaN(lat) || isNaN(lng) || lat < 59 || lat > 71 || lng < 19 || lng > 32) {
    res.status(400).json({ error: 'Koordinaatit puuttuvat tai ovat Suomen alueen ulkopuolella' });
    return;
  }

  try {
    const feature = await searchCadastreByCoordinates(lat, lng);
    if (!feature) {
      res.status(404).json({ error: 'Tästä kohdasta ei löytynyt kiinteistöä' });
      return;
    }
    res.json(feature);
  } catch (error) {
    if (sendServiceError(res, error)) return;
    console.error('Cadastre at-coordinate error:', error);
    res.status(502).json({ error: 'Kiinteistön haku epäonnistui. Yritä hetken kuluttua uudelleen.' });
  }
});

export default router;
