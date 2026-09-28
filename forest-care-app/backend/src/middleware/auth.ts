import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
}

// Optional auth for public routes: sets req.userId when a valid token is sent, never rejects
export function optionalAuthMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  const token = req.headers['authorization']?.split(' ')[1];
  if (token) {
    try {
      const secret = process.env.JWT_SECRET || 'fallback-secret';
      req.userId = (jwt.verify(token, secret) as { userId: number }).userId;
    } catch {
      // Invalid token on a public route: continue anonymously
    }
  }
  next();
}

// JWT authentication middleware - validates the Bearer token in Authorization header
export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const payload = jwt.verify(token, secret) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}
