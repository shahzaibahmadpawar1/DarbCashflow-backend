import { Router } from 'express';
import {
  getNozzles,
  getTanks,
  getCurrentShiftData,
  createShiftData,
  getAllShiftsData,
  getShiftDetailsData,
  getReadings,
  createReadings,
  lockShiftData,
  unlockShiftData,
  updateReading,
  createTankerDelivery,
  getDeliveries,
  deleteShiftData,
} from '../controllers/inventory.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.get('/stations/:stationId/nozzles', authenticate, getNozzles);
router.get('/stations/:stationId/tanks', authenticate, getTanks);
router.get('/shifts/stations/:stationId/current', authenticate, getCurrentShiftData);
router.get('/shifts/stations/:stationId/all', authenticate, getAllShiftsData);
router.get('/shifts/:shiftId/details', authenticate, getShiftDetailsData);
router.post('/shifts/stations/:stationId/create', authenticate, authorize('SM'), createShiftData);
router.get('/shifts/:shiftId/readings', authenticate, getReadings);
router.post('/shifts/:shiftId/readings', authenticate, authorize('SM'), createReadings);
router.post('/shifts/:shiftId/lock', authenticate, authorize('SM'), lockShiftData);
router.post('/shifts/:shiftId/unlock', authenticate, authorize('Admin'), unlockShiftData);
router.put('/shifts/:shiftId/readings/:readingId', authenticate, authorize('SM'), updateReading);
router.post('/stations/:stationId/deliveries', authenticate, createTankerDelivery);
router.post('/tanks/:tankId/deliveries', authenticate, createTankerDelivery);
router.get('/deliveries', authenticate, getDeliveries);
router.delete('/shifts/:shiftId', authenticate, authorize('Admin'), deleteShiftData);

export default router;
