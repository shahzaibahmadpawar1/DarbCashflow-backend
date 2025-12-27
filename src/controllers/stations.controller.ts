import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import db from '../config/database';
import { stations } from '../db/schema';
import { eq } from 'drizzle-orm';

export const getStations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let result: any[] = [];

    if (req.user.role === 'SM' && req.user.stationId) {
      // SM can only see their own station
      result = await db.query.stations.findMany({
        where: eq(stations.id, req.user.stationId),
      });
    } else if (req.user.role === 'AM') {
      // AM can see stations in their area (simplified - would need area mapping)
      result = await db.query.stations.findMany();
    } else if (req.user.role === 'Admin') {
      // Admin can see all stations
      result = await db.query.stations.findMany();
    } else {
      result = [];
    }

    res.json({ stations: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const station = await db.query.stations.findFirst({
      where: eq(stations.id, id),
      with: {
        tanks: true,
        nozzles: true,
      },
    });

    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    res.json({ station });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

