import { Router } from 'express';
import { getStations, getStation, createStation, updateStation, deleteStation, updateStationCreditLimit } from '../controllers/stations.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getStations);
router.post('/', authenticate, createStation);
router.get('/:id', authenticate, getStation);
router.patch('/:id', authenticate, updateStation);
router.put('/:id', authenticate, updateStation); // Support both PUT and PATCH
router.delete('/:id', authenticate, deleteStation);

// Update credit limit (Admin only)
router.put('/:id/credit-limit', authenticate, updateStationCreditLimit);

export default router;


