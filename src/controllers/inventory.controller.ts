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
    const { litersDelivered, deliveryDate, aramcoTicket, notes, fuelType } = req.body;

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
