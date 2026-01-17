import { Router } from 'express';
import {
    createPO,
    getStationPOs,
    getPODetails,
    markPOReceived,
    getDailyPOReport,
} from '../controllers/purchaseOrder.controller';
import { authenticate, requireSM, requireOU } from '../middleware/auth.middleware';

const router = Router();

// Create purchase order (Office User)
router.post('/', authenticate, requireOU, createPO);

// Get purchase orders for a station (Station Manager)
router.get('/station/:stationId', authenticate, getStationPOs);

// Get purchase order details
router.get('/:id', authenticate, getPODetails);

// Mark purchase order as received (Station Manager)
router.put('/:id/receive', authenticate, requireSM, markPOReceived);

// Get daily PO report (Office User)
router.get('/daily-report', authenticate, requireOU, getDailyPOReport);

export default router;
