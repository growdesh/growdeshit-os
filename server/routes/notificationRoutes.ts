import { Router } from 'express';
import {
  getNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from '../controllers/notificationController';
import { authenticateJWT } from '../middleware/authMiddleware';

const router = Router();
router.use(authenticateJWT);

router.get('/', getNotificationsHandler);
router.patch('/read-all', markAllNotificationsReadHandler);
router.patch('/:id/read', markNotificationReadHandler);

export default router;
