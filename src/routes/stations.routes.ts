import { Router } from 'express';
import { getStations, getStation, createStation, updateStation } from '../controllers/stations.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getStations);
router.post('/', authenticate, createStation);
router.get('/:id', authenticate, getStation);
router.patch('/:id', authenticate, updateStation);

export default router;

