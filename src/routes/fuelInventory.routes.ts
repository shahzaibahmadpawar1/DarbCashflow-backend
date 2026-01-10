import { Router } from 'express';
import { getTankInventorySummary, getFuelTypeDetailedView } from '../controllers/fuelInventory.controller';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Get fuel tank inventory summary (Admin only)
router.get('/tank-inventory/summary', authenticate, requireAdmin, getTankInventorySummary);

// Get detailed view for specific fuel type (Admin only)
router.get('/tank-inventory/:fuelType/details', authenticate, requireAdmin, getFuelTypeDetailedView);

export default router;
