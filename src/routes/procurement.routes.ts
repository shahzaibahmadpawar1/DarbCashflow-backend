import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getPendingPOs, getAllProcurementPOs } from '../controllers/procurement.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get pending POs for procurement confirmation (Procurement role only)
router.get('/pending', getPendingPOs);

// Get all POs for procurement user (Procurement role only)
router.get('/all', getAllProcurementPOs);

export default router;
