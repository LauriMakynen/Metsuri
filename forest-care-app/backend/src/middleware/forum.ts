import { NextFunction, Response } from 'express';
import pool from '../db/pool';
import { AuthRequest } from './auth';

export function isForumAdmin(role: unknown): role is 'admin' {
  return role === 'admin';
}

export async function forumAdminMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query('SELECT role FROM users WHERE id = $1', [req.userId]);
    if (!isForumAdmin(result.rows[0]?.role)) {
      res.status(403).json({ error: 'Vain ylläpitäjä voi käyttää tätä toimintoa' });
      return;
    }
    next();
  } catch (error) {
    console.error('Forum admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function forumWriteMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await pool.query('SELECT forum_banned FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0] || result.rows[0].forum_banned) {
      res.status(403).json({ error: 'Kirjoitusoikeutesi foorumille on estetty' });
      return;
    }
    next();
  } catch (error) {
    console.error('Forum write access check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
