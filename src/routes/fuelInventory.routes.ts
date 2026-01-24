import { Router } from 'express';
import { getTankInventorySummary, getFuelTypeDetailedView } from '../controllers/fuelInventory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Get fuel tank inventory summary
router.get('/tank-inventory/summary', authenticate, authorize('Admin', 'OU', 'Accountant', 'ViewOnly', 'Procurement'), getTankInventorySummary);

// Get detailed view for specific fuel type
router.get('/tank-inventory/:fuelType/details', authenticate, authorize('Admin', 'OU', 'Accountant', 'ViewOnly', 'Procurement'), getFuelTypeDetailedView);

export default router;
