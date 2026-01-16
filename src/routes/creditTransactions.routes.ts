import { Router } from 'express';
import {
    getCreditTransactions,
    getCreditSummary,
    submitPayment,
    verifyPayment,
    getPendingPayments
} from '../controllers/creditTransactions.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Get credit transactions for a station
router.get('/:stationId', authenticate, getCreditTransactions);

// Get credit summary for a station
router.get('/:stationId/summary', authenticate, getCreditSummary);

// Submit a payment
router.post('/payment', authenticate, submitPayment);

// Verify a payment (Accountant only)
router.put('/:id/verify', authenticate, verifyPayment);

// Get pending payment verifications (Accountant only)
router.get('/pending/payments', authenticate, getPendingPayments);

export default router;
