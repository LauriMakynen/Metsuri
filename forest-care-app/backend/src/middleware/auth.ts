import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';

export interface AuthRequest extends Request {
  userId?: number;
}

interface TokenPayload {
  userId: number;
  iat: number;
}

function verifyToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  return jwt.verify(token, secret) as TokenPayload;
}

/**
 * A token stays valid only if the user still exists and the password has not been
 * changed after the token was issued (a password reset logs out every session).
 */
async function isTokenCurrent(payload: TokenPayload): Promise<boolean> {
  const result = await pool.query('SELECT password_changed_at FROM users WHERE id = $1', [payload.userId]);
  if (result.rows.length === 0) return false;
  const changedAt: Date | null = result.rows[0].password_changed_at;
  // iat has one-second precision: compare whole seconds so a login right after a reset works
  return !changedAt || Math.floor(changedAt.getTime() / 1000) <= payload.iat;
}

// Optional auth for public routes: sets req.userId when a valid token is sent, never rejects
export async function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    try {
      const payload = verifyToken(token);
      if (await isTokenCurrent(payload)) req.userId = payload.userId;
    } catch {
      // Invalid token on a public route: continue anonymously
    }
  }
  next();
}

// JWT authentication middleware - validates the Bearer token in Authorization header
export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  let payload: TokenPayload;
  try {
    payload = verifyToken(token);
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    if (!(await isTokenCurrent(payload))) {
      res.status(401).json({ error: 'Istunto on vanhentunut. Kirjaudu uudelleen.' });
      return;
    }
  } catch (error) {
    console.error('Auth check error:', error);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  req.userId = payload.userId;
  next();
}
