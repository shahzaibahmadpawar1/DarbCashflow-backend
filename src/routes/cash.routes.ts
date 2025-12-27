import { Router } from 'express';
import {
  createTransaction,
  getTransactions,
  transferCash,
  acceptCashTransfer,
  depositCashTransfer,
  getFloatingCashView,
} from '../controllers/cash.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';

const router = Router();

router.post('/shifts/:shiftId/transactions', authenticate, authorize('SM'), createTransaction);
router.get('/transactions', authenticate, getTransactions);
router.post('/transactions/:id/transfer', authenticate, authorize('SM'), transferCash);
router.post('/transactions/:id/accept', authenticate, authorize('AM'), acceptCashTransfer);
router.post(
  '/transactions/:id/deposit',
  authenticate,
  authorize('AM'),
  upload.single('receipt'),
  depositCashTransfer
);
router.get('/floating-cash', authenticate, authorize('Admin'), getFloatingCashView);

export default router;

