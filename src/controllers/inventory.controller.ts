import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getNozzlesByStation,
  getTanksByStation,
  getCurrentShift,
  getAllShifts,
  getShiftDetails,
  createShift,
  getShiftReadings,
  createShiftReadings,
  lockShift,
  unlockShift,
  updateShiftReading,
  recordTankerDelivery,
  getTankerDeliveries,
  createDailyShift,
  getDailyShift,
  updateDailyShiftReadings,
  savePaymentSummary,
  lockDailyShift,
  updateNozzleOpeningReading,
  updateNozzle,
  addNozzle,
  deleteNozzle,
  getDeliveriesByStation,
  getAdminStationStats,
  getStationStats,
} from '../services/inventory.service';
import db from '../config/database';
import { shifts } from '../db/schema';
import { eq } from 'drizzle-orm';

export const getNozzles = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const nozzles = await getNozzlesByStation(stationId);
    res.json({ nozzles });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getTanks = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const tanks = await getTanksByStation(stationId);
    res.json({ tanks });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getCurrentShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const shift = await getCurrentShift(stationId);
    res.json({ shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const createShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const { shiftType } = req.body;

    if (!shiftType || (shiftType !== 'DAY' && shiftType !== 'NIGHT')) {
      res.status(400).json({ error: 'Shift type must be DAY or NIGHT' });
      return;
    }

    if (!req.user?.stationId || req.user.stationId !== stationId) {
      res.status(403).json({ error: 'You can only create shifts for your assigned station' });
      return;
    }

    const shift = await createShift(stationId, shiftType);
    res.status(201).json({ message: 'Shift created successfully', shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getAllShiftsData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;

    // Check permissions - all roles can view shifts for their station
    if (req.user?.role === 'SM' && req.user.stationId !== stationId) {
      res.status(403).json({ error: 'You can only view shifts for your assigned station' });
      return;
    }

    const shifts = await getAllShifts(stationId);
    res.json({ shifts });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getShiftDetailsData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;

    const shift = await getShiftDetails(shiftId);

    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }

    // Check permissions
    if (req.user?.role === 'SM' && req.user.stationId !== shift.stationId) {
      res.status(403).json({ error: 'You can only view shifts for your assigned station' });
      return;
    }

    res.json({ shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getReadings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    const readings = await getShiftReadings(shiftId);
    res.json({ readings });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const createReadings = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    const { readings } = req.body;

    if (!readings || !Array.isArray(readings)) {
      res.status(400).json({ error: 'Readings array is required' });
      return;
    }

    if (!req.user?.stationId) {
      res.status(403).json({ error: 'Station ID required' });
      return;
    }

    const result = await createShiftReadings(shiftId, req.user.stationId, readings);
    res.status(201).json({ message: 'Readings created successfully', readings: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const lockShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    await lockShift(shiftId);
    res.json({ message: 'Shift locked successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const unlockShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    await unlockShift(shiftId, req.user.id);
    res.json({ message: 'Shift unlocked successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const updateReading = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId, readingId } = req.params;
    const { closingReading } = req.body;

    if (closingReading === undefined) {
      res.status(400).json({ error: 'Closing reading is required' });
      return;
    }

    const reading = await updateShiftReading(shiftId, readingId, parseFloat(closingReading));
    res.json({ message: 'Reading updated successfully', reading });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const createTankerDelivery = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tankId, stationId } = req.params;
    const { litersDelivered, deliveryDate, aramcoTicket, notes, fuelType, receiptUrl } = req.body;

    if (!litersDelivered) {
      res.status(400).json({ error: 'Liters delivered is required' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const result = await recordTankerDelivery({
      tankId,
      stationId,
      fuelType,
      litersDelivered: parseFloat(litersDelivered),
      deliveryDate: deliveryDate ? new Date(deliveryDate) : new Date(),
      deliveredBy: req.user.id,
      aramcoTicket,
      notes,
      receiptUrl,
    });

    res.status(201).json({
      message: 'Delivery recorded successfully',
      delivery: result.delivery,
      tank: result.tank
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tankId } = req.query;
    const deliveries = await getTankerDeliveries(tankId as string | undefined);
    res.json({ deliveries });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getStationDeliveries = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const deliveries = await getDeliveriesByStation(stationId);
    res.json({ deliveries });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const deleteShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;

    // Delete shift (cascade will delete related nozzle sales, readings, cash transactions)
    await db.delete(shifts).where(eq(shifts.id, shiftId));

    res.json({ message: 'Shift deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

// ==================== DAILY SHIFT CONTROLLERS ====================

export const createDailyShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const { shiftDate: requestedShiftDate } = req.body;

    if (!req.user?.stationId || req.user.stationId !== stationId) {
      res.status(403).json({ error: 'You can only create shifts for your assigned station' });
      return;
    }

    // Use provided date or default to current date
    const shiftDate = requestedShiftDate ? new Date(requestedShiftDate) : new Date();
    const newShift = await createDailyShift(stationId, shiftDate);

    // Get the full shift with readings and payment summary
    const shift = await getDailyShift(newShift.id);

    res.status(201).json({ message: 'Daily shift created successfully', shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getDailyShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    const shift = await getDailyShift(shiftId);

    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }

    // Check permissions
    if (req.user?.role === 'SM' && req.user.stationId !== shift.stationId) {
      res.status(403).json({ error: 'You can only view shifts for your assigned station' });
      return;
    }

    res.json({ shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const updateDailyShiftReadingsData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    const { readings } = req.body;

    if (!readings || !Array.isArray(readings)) {
      res.status(400).json({ error: 'Readings array is required' });
      return;
    }

    const shift = await updateDailyShiftReadings(shiftId, readings);
    res.json({ message: 'Readings updated successfully', shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const savePaymentSummaryData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    const { cardAmount, cashAmount, option3Amount, option4Amount } = req.body;

    if (cardAmount === undefined || cashAmount === undefined ||
      option3Amount === undefined || option4Amount === undefined) {
      res.status(400).json({ error: 'All payment amounts are required' });
      return;
    }

    const paymentSummary = await savePaymentSummary(shiftId, {
      cardAmount: parseFloat(cardAmount),
      cashAmount: parseFloat(cashAmount),
      option3Amount: parseFloat(option3Amount),
      option4Amount: parseFloat(option4Amount),
    });

    res.json({ message: 'Payment summary saved successfully', paymentSummary });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const lockDailyShiftData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { shiftId } = req.params;
    const shift = await lockDailyShift(shiftId);
    res.json({ message: 'Shift locked successfully', shift });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const updateNozzleOpeningReadingData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nozzleId } = req.params;
    const { openingReading } = req.body;

    if (openingReading === undefined) {
      res.status(400).json({ error: 'Opening reading is required' });
      return;
    }

    const nozzle = await updateNozzleOpeningReading(nozzleId, parseFloat(openingReading));
    res.json({ message: 'Opening reading updated successfully', nozzle });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getAdminStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date, startDate, endDate } = req.query;

    const stats = await getAdminStationStats({
      date: date as string,
      startDate: startDate as string,
      endDate: endDate as string,
    });
    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getStationStatsData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const stats = await getStationStats(stationId);
    res.json({ stats });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

// ==================== NOZZLE MANAGEMENT CONTROLLERS ====================

export const updateNozzleData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nozzleId } = req.params;
    const { name, fuelType } = req.body;

    if (!name && !fuelType) {
      res.status(400).json({ error: 'At least one field (name or fuelType) is required' });
      return;
    }

    const nozzle = await updateNozzle(nozzleId, { name, fuelType });
    res.json({ message: 'Nozzle updated successfully', nozzle });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const addNozzleData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { stationId } = req.params;
    const { name, fuelType, openingReading } = req.body;

    if (!name || !fuelType) {
      res.status(400).json({ error: 'Name and fuel type are required' });
      return;
    }

    const nozzle = await addNozzle({
      stationId,
      name,
      fuelType,
      openingReading: openingReading !== undefined ? parseFloat(openingReading) : 0,
    });

    res.status(201).json({ message: 'Nozzle added successfully', nozzle });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const deleteNozzleData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nozzleId } = req.params;
    await deleteNozzle(nozzleId);
    res.json({ message: 'Nozzle deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

