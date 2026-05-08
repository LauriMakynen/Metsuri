import { Router, Request, Response } from 'express';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const MML_TILE_STYLE_MAP: Record<string, string> = {
  maastokartta: 'maastokartta',
  peruskartta: 'taustakartta',
  ortokuva: 'ortokuva',
  kiinteistorajat: 'kiinteistojaotus',
};

// The /layers config endpoint requires auth (returns provider info)
// The /tiles endpoint does NOT require auth – tiles are loaded via <img> tags by Leaflet
// which cannot send the Authorization header. Tile security is provided by the
// MML API key being kept server-side only.

router.get('/layers', authMiddleware, (_req: AuthRequest, res: Response) => {
  const apiKey = process.env.MML_API_KEY;

  if (apiKey) {
    const key = encodeURIComponent(apiKey);
    const base = 'https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0';
    res.json({
      provider: 'mml-direct',
      layers: {
        maastokartta: `${base}/maastokartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
        peruskartta: `${base}/taustakartta/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
        ortokuva: `${base}/ortokuva/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
      },
      overlays: {
        kiinteistorajat: `${base}/kiinteistojaotus/default/WGS84_Pseudo-Mercator/{z}/{y}/{x}.png?api-key=${key}`,
      },
      attribution: 'Maanmittauslaitos',
    });
    return;
  }

  res.json({
    provider: 'fallback',
    layers: {
      maastokartta: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      peruskartta: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ortokuva:
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    },
    attribution: 'OpenStreetMap / Esri',
  });
});

router.get('/tiles/:style/:z/:x/:y', async (req: Request, res: Response): Promise<void> => {
  const { style, z, x, y } = req.params;
  const mappedStyle = MML_TILE_STYLE_MAP[style];

  if (!mappedStyle) {
    res.status(400).json({ error: 'Invalid map style' });
    return;
  }

  const apiKey = process.env.MML_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'MML API key is not configured' });
    return;
  }

  try {
    const targetUrl = `https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/${mappedStyle}/default/WGS84_Pseudo-Mercator/${z}/${y}/${x}.png?api-key=${encodeURIComponent(apiKey)}`;
    const tileResponse = await fetch(targetUrl);

    if (!tileResponse.ok) {
      res.status(tileResponse.status).json({ error: 'Tile fetch failed' });
      return;
    }

    const contentType = tileResponse.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await tileResponse.arrayBuffer());

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    console.error('Tile proxy error:', error);
    res.status(502).json({ error: 'Tile proxy request failed' });
  }
});

export default router;
