import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { ensureDatabaseInitialized, isDatabaseInitialized, isMysqlMode } from './config/db';
import authRoutes from './routes/authRoutes';
import auditRoutes from './routes/auditRoutes';
import customerRoutes from './routes/customerRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import financeRoutes from './routes/financeRoutes';
import mcpRoutes from './routes/mcpRoutes';
import notificationRoutes from './routes/notificationRoutes';
import projectRoutes from './routes/projectRoutes';
import reportRoutes from './routes/reportRoutes';

export function createExpressApp(): Express {
  const app = express();
  app.set('trust proxy', 1);

  // Strict origin handling — no wildcard CORS on authenticated API routes
  const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, Mcp-Session-Id');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.use('/api', async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      await ensureDatabaseInitialized();
      next();
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'GrowDeshIT OS API',
      storage: isMysqlMode() ? 'mysql' : 'preview',
      initialized: isDatabaseInitialized(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/finance', financeRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/mcp', mcpRoutes);

  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[GrowDeshIT OS] Unhandled server error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  });

  return app;
}
