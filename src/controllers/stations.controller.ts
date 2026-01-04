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

export const createStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, address, stationType, nozzles: nozzleConfig, fuelPrices: pricesConfig } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Station name is required' });
      return;
    }

    // Create station
    const [station] = await db.insert(stations).values({
      name,
      address,
      stationType: stationType || 'OPERATIONAL',
    }).returning();

    // If nozzle configuration is provided, create nozzles
    if (nozzleConfig && Array.isArray(nozzleConfig) && nozzleConfig.length > 0) {
      const { tanks, nozzles, fuelPrices } = await import('../db/schema');

      // Create tanks for each fuel type
      const fuelTypes = ['91_GASOLINE', '95_GASOLINE', 'DIESEL'];
      const tankMap = new Map<string, string>();

      for (const fuelType of fuelTypes) {
        const [tank] = await db.insert(tanks).values({
          stationId: station.id,
          fuelType: fuelType as any,
          capacity: 100000,
          currentLevel: 0,
        }).returning();
        tankMap.set(fuelType, tank.id);
      }

      // Create nozzles
      for (const nozzle of nozzleConfig) {
        const tankId = tankMap.get(nozzle.fuelType);
        if (!tankId) continue;

        await db.insert(nozzles).values({
          name: nozzle.name,
          stationId: station.id,
          tankId,
          fuelType: nozzle.fuelType as any,
          openingReading: nozzle.openingReading || 0,
          meterLimit: 999999,
        });
      }

      // Create fuel prices
      if (pricesConfig && Array.isArray(pricesConfig)) {
        for (const price of pricesConfig) {
          await db.insert(fuelPrices).values({
            stationId: station.id,
            fuelType: price.fuelType as any,
            pricePerLiter: price.pricePerLiter,
            createdBy: req.user?.id,
          });
        }
      }
    }

    res.status(201).json({ message: 'Station created successfully', station });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const updateStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, address, stationType } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (stationType !== undefined) updateData.stationType = stationType;

    const [updatedStation] = await db.update(stations)
      .set(updateData)
      .where(eq(stations.id, id))
      .returning();

    if (!updatedStation) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    res.json({ message: 'Station updated successfully', station: updatedStation });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

