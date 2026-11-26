import { Router } from 'express';
import { getReportsHandler } from '../controllers/reportController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();
router.use(authenticateJWT);

router.get('/', getReportsHandler);

export default router;
