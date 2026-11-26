import { Router } from 'express';
import {
  createCustomerHandler,
  deleteCustomerHandler,
  getCustomerHandler,
  listCustomersHandler,
  updateCustomerHandler,
} from '../controllers/customerController';
import { authenticateJWT, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/', listCustomersHandler);
router.get('/:id', getCustomerHandler);
router.post('/', createCustomerHandler);
router.put('/:id', updateCustomerHandler);
router.delete('/:id', requireRole('superadmin'), deleteCustomerHandler);

export default router;
