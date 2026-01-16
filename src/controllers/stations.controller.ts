import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import db from '../config/database';
import { stations, creditTransactions } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getAccessibleStationIds } from '../services/officeUser.service';

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
    } else if (req.user.role === 'OU') {
      // Office User - see only assigned stations
      const accessibleStations = await getAccessibleStationIds(req.user.id);

      if (accessibleStations === 'all') {
        result = await db.query.stations.findMany();
      } else if (accessibleStations.length > 0) {
        result = await db.query.stations.findMany({
          where: inArray(stations.id, accessibleStations)
        });
      } else {
        result = [];
      }
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
    const { name, address, stationType, purchaseCredits, nozzles: nozzleConfig, fuelPrices: pricesConfig } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Station name is required' });
      return;
    }

    // Create station
    const [station] = await db.insert(stations).values({
      name,
      address,
      stationType: stationType || 'OPERATIONAL',
      purchaseCredits: purchaseCredits || 0,
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

      // Create nozzles with station name prefix for uniqueness
      for (let i = 0; i < nozzleConfig.length; i++) {
        const nozzle = nozzleConfig[i];
        const tankId = tankMap.get(nozzle.fuelType);
        if (!tankId) continue;

        // Prefix nozzle name with station name to ensure uniqueness
        const uniqueNozzleName = `${name}-${nozzle.name}`;

        await db.insert(nozzles).values({
          name: uniqueNozzleName,
          stationId: station.id,
          tankId,
          fuelType: nozzle.fuelType as any,
          openingReading: nozzle.openingReading || 0,
          meterLimit: 999999,
          displayOrder: i + 1, // Set display order based on creation sequence
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
    const { name, address, stationType, purchaseCredits } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (stationType !== undefined) updateData.stationType = stationType;
    if (purchaseCredits !== undefined) updateData.purchaseCredits = purchaseCredits;

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

export const deleteStation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if station exists
    const station = await db.query.stations.findFirst({
      where: eq(stations.id, id),
    });

    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    // Delete the station (cascading deletes should handle related records)
    await db.delete(stations).where(eq(stations.id, id));

    res.json({ message: 'Station deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

// Update station credit limit (Admin only)
export const updateStationCreditLimit = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { totalCreditLimit, hasCreditFacility } = req.body;

    // Check if user is admin
    if (req.user?.role !== 'Admin') {
      res.status(403).json({ error: 'Only admins can update credit limits' });
      return;
    }

    if (totalCreditLimit === undefined || hasCreditFacility === undefined) {
      res.status(400).json({ error: 'totalCreditLimit and hasCreditFacility are required' });
      return;
    }

    const station = await db.query.stations.findFirst({
      where: eq(stations.id, id),
    });

    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }

    await db.transaction(async (tx) => {
      // Update station credit settings
      await tx.update(stations)
        .set({
          totalCreditLimit,
          hasCreditFacility,
          purchaseCredits: totalCreditLimit - station.utilizedCredits, // Update available credits
        })
        .where(eq(stations.id, id));

      // Create credit transaction record for allocation
      if (totalCreditLimit !== station.totalCreditLimit) {
        const difference = totalCreditLimit - station.totalCreditLimit;
        await tx.insert(creditTransactions).values({
          stationId: id,
          type: 'ALLOCATION',
          amount: Math.abs(difference),
          description: difference > 0
            ? `Credit limit increased from ${station.totalCreditLimit} to ${totalCreditLimit}`
            : `Credit limit decreased from ${station.totalCreditLimit} to ${totalCreditLimit}`,
          createdBy: req.user!.id,
          verifiedBy: req.user!.id,
          verifiedAt: new Date(),
        });
      }
    });


    res.json({ message: 'Credit limit updated successfully' });
  } catch (error: any) {
    console.error('Error updating credit limit:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
