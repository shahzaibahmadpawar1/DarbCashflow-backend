import { Router } from 'express';
import {
    createPO,
    getStationPOs,
    getPODetails,
    confirmProcurementPO,
    markPOReceived,
    getDailyPOReport,
} from '../controllers/purchaseOrder.controller';
import { authenticate, requireSM, requireOU } from '../middleware/auth.middleware';

const router = Router();

// Create purchase order (Office User)
router.post('/', authenticate, requireOU, createPO);

// Get daily PO report (Office User) - MUST be before /:id route
router.get('/daily-report', authenticate, getDailyPOReport);

// Get purchase orders for a station (Station Manager)
router.get('/station/:stationId', authenticate, getStationPOs);

// Get purchase order details
router.get('/:id', authenticate, getPODetails);

// Confirm procurement (Admin/OU/Procurement)
router.put('/:id/confirm-procurement', authenticate, confirmProcurementPO);

// Mark purchase order as received (Station Manager)
router.put('/:id/receive', authenticate, requireSM, markPOReceived);

export default router;
