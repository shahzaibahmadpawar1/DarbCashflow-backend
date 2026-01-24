import { Router } from 'express';
import {
    createPR,
    getStationPRs,
    getOfficeUserPRs,
    getPRDetails,
    approvePR,
    rejectPR,
    verifyPRPayment,
} from '../controllers/purchaseRequest.controller';
import { authenticate, requireSM, requireOU, authorize } from '../middleware/auth.middleware';

const router = Router();

// Create purchase request (Station Manager)
router.post('/', authenticate, requireSM, createPR);

// Get purchase requests for a station (Station Manager)
router.get('/station/:stationId', authenticate, getStationPRs);

// Get purchase requests for office user's assigned stations
router.get('/office-user', authenticate, requireOU, getOfficeUserPRs);

// Get purchase request details
router.get('/:id', authenticate, getPRDetails);

// Approve purchase request (Office User)
router.put('/:id/approve', authenticate, authorize('Admin', 'OU'), approvePR);

// Reject purchase request (Office User)
router.put('/:id/reject', authenticate, authorize('Admin', 'OU'), rejectPR);

// Verify payment for purchase request (Accountant)
router.put('/:id/verify-payment', authenticate, verifyPRPayment);

export default router;
