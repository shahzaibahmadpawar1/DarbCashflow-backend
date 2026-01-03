import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getNozzlesByStation,
  getTanksByStation,
  getCurrentShift,
  createShift,
  getShiftReadings,
  createShiftReadings,
  lockShift,
  unlockShift,
  updateShiftReading,
  recordTankerDelivery,
  getTankerDeliveries,
} from '../services/inventory.service';

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
    const { tankId } = req.params;
    const { litersDelivered, deliveryDate, aramcoTicket, notes } = req.body;

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

