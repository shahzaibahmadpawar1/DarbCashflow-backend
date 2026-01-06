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
  createDailyShiftData,
  getDailyShiftData,
  updateDailyShiftReadingsData,
  savePaymentSummaryData,
  lockDailyShiftData,
  updateNozzleOpeningReadingData,
  updateNozzleData,
  addNozzleData,
  deleteNozzleData,
  getStationDeliveries,
  getStationStatsData,
  getAdminStats,
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
router.get('/stations/:stationId/deliveries', authenticate, getStationDeliveries);
router.post('/tanks/:tankId/deliveries', authenticate, createTankerDelivery);
router.get('/deliveries', authenticate, getDeliveries);
router.delete('/shifts/:shiftId', authenticate, authorize('Admin'), deleteShiftData);

// Daily Shift Routes
router.post('/shifts/stations/:stationId/daily', authenticate, authorize('SM'), createDailyShiftData);
router.get('/shifts/:shiftId/daily', authenticate, getDailyShiftData);
router.put('/shifts/:shiftId/daily/readings', authenticate, authorize('SM'), updateDailyShiftReadingsData);
router.post('/shifts/:shiftId/daily/payment-summary', authenticate, authorize('SM'), savePaymentSummaryData);
router.post('/shifts/:shiftId/daily/lock', authenticate, authorize('SM'), lockDailyShiftData);
router.patch('/nozzles/:nozzleId/opening-reading', authenticate, authorize('Admin'), updateNozzleOpeningReadingData);
router.patch('/nozzles/:nozzleId', authenticate, authorize('Admin'), updateNozzleData);
router.post('/stations/:stationId/nozzles', authenticate, authorize('Admin'), addNozzleData);
router.delete('/nozzles/:nozzleId', authenticate, authorize('Admin'), deleteNozzleData);
router.get('/admin/stats', authenticate, authorize('Admin', 'OU'), getAdminStats);
router.get('/stations/:stationId/stats', authenticate, getStationStatsData);

export default router;
