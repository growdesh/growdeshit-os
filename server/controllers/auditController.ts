import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { listActivityLogs } from '../services/auditService';

export async function getAuditLogsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const result = await listActivityLogs(
      {
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        source: typeof req.query.source === 'string' ? req.query.source : undefined,
        entity_type: typeof req.query.entity_type === 'string' ? req.query.entity_type : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
      },
      req.user
    );

    res.json(result);
  } catch (error) {
    console.error('[AuditController]', error);
    res.status(500).json({ error: 'Failed to load activity logs.' });
  }
}
