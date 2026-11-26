import { Router } from 'express';
import {
  createTransactionHandler,
  deletePaymentHandler,
  deleteTransactionHandler,
  getInvoiceHandler,
  listPaymentsHandler,
  listTransactionsHandler,
  recordPaymentHandler,
} from '../controllers/financeController';
import { authenticateJWT, requireRole } from '../middleware/authMiddleware';

const router = Router();

router.use(authenticateJWT);

router.get('/transactions', listTransactionsHandler);
router.post('/transactions', createTransactionHandler);
router.delete('/transactions/:id', requireRole('superadmin'), deleteTransactionHandler);

router.get('/payments', listPaymentsHandler);
router.post('/payments', recordPaymentHandler);
router.delete('/payments/:id', requireRole('superadmin'), deletePaymentHandler);

router.get('/invoices/:paymentId', getInvoiceHandler);

export default router;
