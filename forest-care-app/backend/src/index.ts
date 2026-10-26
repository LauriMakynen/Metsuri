import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import propertiesRoutes from './routes/properties';
import markingsRoutes from './routes/markings';
import cadastreRoutes from './routes/cadastre';
import mapRoutes from './routes/map';
import workRequestsRoutes from './routes/workRequests';
import forestValueRoutes from './routes/forestValue';
import { getAllowedOrigins, isAllowedOrigin } from './config/allowedOrigins';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const allowedOrigins = getAllowedOrigins(process.env.FRONTEND_URL, process.env.FRONTEND_URLS);
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, allowedOrigins)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

// Rate limiting for auth endpoints - strict limit to prevent brute-force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter for authenticated routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// More strict limiter for external cadastre lookups
const cadastreLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  message: { error: 'Too many cadastre searches, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// API Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/properties', apiLimiter, propertiesRoutes);
app.use('/api/markings', apiLimiter, markingsRoutes);
app.use('/api/cadastre', cadastreLimiter, cadastreRoutes);
app.use('/api/map', apiLimiter, mapRoutes);
app.use('/api/work-requests', apiLimiter, workRequestsRoutes);
app.use('/api/forest-value', apiLimiter, forestValueRoutes);

// Health check endpoints
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API health check (for deployment verification)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Forest Care Backend running on port ${PORT}`);
});

export default app;
