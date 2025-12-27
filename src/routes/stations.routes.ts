import { Router } from 'express';
import { getStations, getStation } from '../controllers/stations.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authenticate, getStations);
router.get('/:id', authenticate, getStation);

export default router;

