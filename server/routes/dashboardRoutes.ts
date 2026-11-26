import { Router } from 'express';
import { dashboardOverviewHandler } from '../controllers/dashboardController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authenticateJWT, dashboardOverviewHandler);

export default router;
