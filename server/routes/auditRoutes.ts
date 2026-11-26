import { Router } from 'express';
import { getAuditLogsHandler } from '../controllers/auditController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();
router.use(authenticateJWT);

router.get('/', getAuditLogsHandler);

export default router;
