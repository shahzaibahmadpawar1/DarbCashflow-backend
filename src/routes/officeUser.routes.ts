import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.middleware';
import * as officeUserController from '../controllers/officeUser.controller';

const router = Router();

// Admin only - Assign stations to Office User
router.post('/:userId/stations', authenticate, requireAdmin, officeUserController.assignStations);

// Get assigned stations for an Office User
router.get('/:userId/stations', authenticate, officeUserController.getAssignedStations);

// Admin only - Get all Office Users with their assigned stations
router.get('/', authenticate, requireAdmin, officeUserController.getAllOfficeUsers);

export default router;
