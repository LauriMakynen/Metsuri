import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db/pool';
import { sendPasswordResetEmail } from '../services/mailer';

const router = Router();

// POST /api/auth/register - Create a new user account
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters' });
    return;
  }

  try {
    // Check if email already exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase(),
    ]);
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    // Hash password with bcrypt (10 salt rounds)
    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase(), password_hash]
    );

    const user = result.rows[0];
    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ userId: user.id }, secret, { expiresIn } as jwt.SignOptions);

    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login - Authenticate user and return JWT token
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const secret = process.env.JWT_SECRET || 'fallback-secret';
    const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
    const token = jwt.sign({ userId: user.id }, secret, { expiresIn } as jwt.SignOptions);

    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const RESET_TOKEN_VALID_MINUTES = 30;
// Ignore repeat requests for the same account within this window (mailbox flooding)
const RESET_REQUEST_COOLDOWN_SECONDS = 60;

function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// POST /api/auth/forgot-password - Email a single-use password reset link.
// Always answers the same way so the response never reveals whether an account exists.
router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const genericResponse = {
    message: 'Jos osoitteella on tili, lähetimme siihen linkin salasanan vaihtoon.',
  };

  if (!email) {
    res.status(400).json({ error: 'Anna sähköpostiosoite' });
    return;
  }

  try {
    const user = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      res.json(genericResponse);
      return;
    }
    const userId = user.rows[0].id;

    const recent = await pool.query(
      `SELECT 1 FROM password_reset_tokens
       WHERE user_id = $1 AND created_at > NOW() - make_interval(secs => $2)`,
      [userId, RESET_REQUEST_COOLDOWN_SECONDS]
    );
    if (recent.rows.length > 0) {
      res.json(genericResponse);
      return;
    }

    // Only the newest link works: drop earlier unused tokens
    await pool.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);

    const token = crypto.randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + make_interval(mins => $3))`,
      [userId, hashResetToken(token), RESET_TOKEN_VALID_MINUTES]
    );

    // Link base comes from configuration, never from request headers (host header injection)
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
    await sendPasswordResetEmail(
      user.rows[0].email,
      `${frontendUrl}/reset-password?token=${token}`,
      RESET_TOKEN_VALID_MINUTES
    );

    res.json(genericResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Linkin lähetys epäonnistui. Yritä hetken kuluttua uudelleen.' });
  }
});

// POST /api/auth/reset-password - Set a new password with a valid reset token
router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body ?? {};

  if (typeof token !== 'string' || !token) {
    res.status(400).json({ error: 'Linkki on virheellinen' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Salasanan pitää olla vähintään 8 merkkiä' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Claim the token atomically so it can only be used once
    const claimed = await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       RETURNING user_id`,
      [hashResetToken(token)]
    );
    if (claimed.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ error: 'Linkki on vanhentunut tai jo käytetty.', code: 'token_invalid' });
      return;
    }
    const userId = claimed.rows[0].user_id;

    const password_hash = await bcrypt.hash(password, 10);
    // password_changed_at invalidates every login token issued before this moment
    await client.query(
      'UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2',
      [password_hash, userId]
    );
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await client.query('COMMIT');

    res.json({ message: 'Salasana vaihdettu. Voit nyt kirjautua uudella salasanalla.' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

export default router;
