import { Router } from 'express';
import { getCurrentShiftData } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/stations/:stationId/current', authenticate, getCurrentShiftData);

export default router;

