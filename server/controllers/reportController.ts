import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { getFinancialReport } from '../services/reportService';

export async function getReportsHandler(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const month = typeof req.query.month === 'string' ? req.query.month : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    const report = await getFinancialReport({ month, startDate, endDate });
    res.json(report);
  } catch (error) {
    console.error('[ReportController]', error);
    res.status(500).json({ error: 'Failed to generate financial report.' });
  }
}
