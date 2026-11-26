import type { Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { getDashboardOverview } from '../services/dashboardService';

export async function dashboardOverviewHandler(
  _req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const overview = await getDashboardOverview();
    res.json(overview);
  } catch (error) {
    console.error('[DashboardController]', error);
    res.status(500).json({ error: 'Failed to load dashboard overview.' });
  }
}
