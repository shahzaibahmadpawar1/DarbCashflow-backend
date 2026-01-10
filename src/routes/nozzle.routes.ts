import { Router } from 'express';
import { updateNozzlesOrder, getStationNozzles } from '../controllers/nozzle.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Get nozzles for a station (ordered by displayOrder)
router.get('/stations/:stationId/nozzles', authenticate, getStationNozzles);

// Update nozzle order (Admin only)
router.put('/stations/:stationId/nozzles/order', authenticate, requireAdmin, updateNozzlesOrder);

export default router;
