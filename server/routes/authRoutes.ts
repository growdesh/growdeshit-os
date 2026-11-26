import { Router } from 'express';
import {
  createUserHandler,
  deleteUserHandler,
  listUsersHandler,
  loginHandler,
  meHandler,
} from '../controllers/authController';
import { authenticateJWT, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.post('/login', loginHandler);

router.get('/me', authenticateJWT, meHandler);
router.get('/users', authenticateJWT, listUsersHandler);
router.post('/users', authenticateJWT, requireRole('superadmin'), createUserHandler);
router.delete('/users/:id', authenticateJWT, requireRole('superadmin'), deleteUserHandler);

export default router;
