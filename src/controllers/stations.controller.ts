import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import prisma from '../config/database';

export const getStations = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    let stations;

    if (req.user.role === 'SM' && req.user.stationId) {
      // SM can only see their own station
      stations = await prisma.station.findMany({
        where: { id: req.user.stationId },
      });
    } else if (req.user.role === 'AM') {
      // AM can see stations in their area (simplified - would need area mapping)
      stations = await prisma.station.findMany();
    } else if (req.user.role === 'Admin') {
      // Admin can see all stations
      stations = await prisma.station.findMany();
    } else {
      stations = [];
    }

    res.json({ stations });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const station = await prisma.station.findUnique({
      where: { id },
      include: {
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

