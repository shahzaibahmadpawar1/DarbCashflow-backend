import { Router } from 'express';
import {
    createFuelPrice,
    getStationFuelPrices,
    getAllPrices,
    getShiftSales,
    updateSale,
    submitSales,
} from '../controllers/fuel.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Fuel Prices (Admin only)
router.post('/prices', authenticate, authorize('Admin'), createFuelPrice);
router.get('/prices/station/:stationId', authenticate, getStationFuelPrices);
router.get('/prices', authenticate, authorize('Admin'), getAllPrices);

// Nozzle Sales (Station Manager)
router.get('/sales/shift/:shiftId', authenticate, getShiftSales);
router.put('/sales/:saleId', authenticate, authorize('SM'), updateSale);
router.post('/sales/shift/:shiftId/submit', authenticate, authorize('SM'), submitSales);

export default router;
