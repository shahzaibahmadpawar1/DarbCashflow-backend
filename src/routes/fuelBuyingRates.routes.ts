import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
    createBuyingRate,
    getStationBuyingRates,
    getSpecificBuyingRate,
    getAllRates,
    getRateHistory,
} from '../controllers/fuelBuyingRates.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Set buying rate (Admin only)
router.post('/', createBuyingRate);

// Get all buying rates (Admin only)
router.get('/all', getAllRates);

// Get buying rates for a station
router.get('/station/:stationId', getStationBuyingRates);

// Get specific buying rate for station and fuel type
router.get('/station/:stationId/:fuelType', getSpecificBuyingRate);

// Get buying rate history
router.get('/history/:stationId/:fuelType', getRateHistory);

export default router;
