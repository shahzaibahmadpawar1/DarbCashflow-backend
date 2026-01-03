import db from '../config/database';
import { nozzles, tanks, shifts, nozzleReadings, tankerDeliveries } from '../db/schema';
import { eq, and, desc, inArray, gte, lt, ne, sql } from 'drizzle-orm';

export const getNozzlesByStation = async (stationId: string) => {
  return db.query.nozzles.findMany({
    where: eq(nozzles.stationId, stationId),
    with: {
      tank: true,
    },
    orderBy: sql`${nozzles.name} asc`,
  });
};

export const getTanksByStation = async (stationId: string) => {
  // Doing a manual join count or fetching all nozzles 
  // Drizzle doesn't have a simple _count relation yet, so we'll fetch relation
  const result = await db.query.tanks.findMany({
    where: eq(tanks.stationId, stationId),
    with: {
      nozzles: true,
    },
  });

  return result.map(tank => ({
    ...tank,
    _count: { nozzles: tank.nozzles.length }
  }));
};

export const getCurrentShift = async (stationId: string) => {
  // Find current open shift (not locked)
  const shift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.stationId, stationId),
      eq(shifts.status, 'OPEN'),
      eq(shifts.locked, false)
    ),
    orderBy: [desc(shifts.startTime)],
  });

  return shift || null;
};

export const getAllShifts = async (stationId: string) => {
  // Get all shifts for a station, ordered by start time (newest first)
  return db.query.shifts.findMany({
    where: eq(shifts.stationId, stationId),
    orderBy: [desc(shifts.startTime)],
    with: {
      nozzleSales: {
        with: {
          nozzle: {
            with: {
              tank: true,
            },
          },
        },
      },
    },
  });
};

export const getShiftDetails = async (shiftId: string) => {
  // Get detailed shift information including sales
  return db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
    with: {
      nozzleSales: {
        with: {
          nozzle: {
            with: {
              tank: true,
            },
          },
        },
      },
    },
  });
};

export const createShift = async (stationId: string, shiftType: 'DAY' | 'NIGHT') => {
  // Check if there's already an open shift
  const existingShift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.stationId, stationId),
      eq(shifts.status, 'OPEN'),
      eq(shifts.locked, false)
    ),
  });

  if (existingShift) {
    throw new Error('There is already an open shift for this station. Please close it first.');
  }

  // Calculate shift start time (midnight for DAY, noon for NIGHT)
  const now = new Date();
  const shiftStart = new Date(now);
  shiftStart.setHours(shiftType === 'DAY' ? 0 : 12, 0, 0, 0);
  shiftStart.setMinutes(0, 0, 0);

  // Create new shift
  const [newShift] = await db.insert(shifts).values({
    stationId,
    shiftType,
    startTime: shiftStart,
    status: 'OPEN',
    locked: false,
  }).returning();

  // Initialize nozzle sales for this shift
  const { initializeNozzleSales } = await import('./fuel.service');
  await initializeNozzleSales(newShift.id, stationId);

  return newShift;
};

export const getShiftReadings = async (shiftId: string) => {
  return db.query.nozzleReadings.findMany({
    where: eq(nozzleReadings.shiftId, shiftId),
    with: {
      nozzle: {
        with: {
          tank: true
        }
      },
    },
  });
};

export const createShiftReadings = async (
  shiftId: string,
  stationId: string,
  readings: Array<{ nozzleId: string; closingReading: number }>
) => {
  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
    with: { nozzleReadings: true },
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.locked) {
    throw new Error('Shift is locked');
  }

  // Get all nozzles for the station
  const allNozzles = await db.query.nozzles.findMany({
    where: eq(nozzles.stationId, stationId),
  });

  // Get previous shift's closing readings as opening readings
  const previousShift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.stationId, stationId),
      ne(shifts.id, shiftId)
    ),
    orderBy: desc(shifts.startTime),
    with: { nozzleReadings: true },
  });

  const openingReadingsMap = new Map<string, number>();
  if (previousShift) {
    previousShift.nozzleReadings.forEach((reading) => {
      if (reading.closingReading !== null) {
        // Drizzle might return fields as strings depending on driver but here we treat as number
        openingReadingsMap.set(reading.nozzleId, Number(reading.closingReading));
      }
    });
  }

  // Process readings and calculate consumption
  const results = [];
  const tankConsumptionMap = new Map<string, number>();

  for (const reading of readings) {
    const nozzle = allNozzles.find((n) => n.id === reading.nozzleId);
    if (!nozzle) {
      throw new Error(`Nozzle ${reading.nozzleId} not found`);
    }

    const openingReading = openingReadingsMap.get(reading.nozzleId) || 0;
    const consumption = reading.closingReading - openingReading;

    if (consumption < 0) {
      throw new Error(`Invalid reading for nozzle ${nozzle.name}`);
    }

    // Track consumption per tank
    const currentTankConsumption = tankConsumptionMap.get(nozzle.tankId) || 0;
    tankConsumptionMap.set(nozzle.tankId, currentTankConsumption + consumption);

    // Create or update shift reading
    // Drizzle insert().onConflictDoUpdate()
    await db.insert(nozzleReadings)
      .values({
        shiftId,
        nozzleId: reading.nozzleId,
        openingReading,
        closingReading: reading.closingReading,
        consumption
      })
      .onConflictDoUpdate({
        target: [nozzleReadings.shiftId, nozzleReadings.nozzleId], // Requires a unique constraint on these columns in DB
        set: {
          closingReading: reading.closingReading,
          consumption
        }
      });

    // We can't easily return the result of onConflictDoUpdate in one go like upsert, 
    // so we skip pushing to results array or re-fetch if needed. 
    // The original code returned results, so let's mock it or re-fetch.
  }

  // Update tank levels (subtract consumption)
  for (const [tankId, consumption] of tankConsumptionMap.entries()) {
    await db.update(tanks)
      .set({ currentLevel: sql`${tanks.currentLevel} - ${consumption}` })
      .where(eq(tanks.id, tankId));
  }

  return db.query.nozzleReadings.findMany({ where: eq(nozzleReadings.shiftId, shiftId) });
};

export const lockShift = async (shiftId: string) => {
  return db.update(shifts)
    .set({
      locked: true,
      status: 'LOCKED',
    })
    .where(eq(shifts.id, shiftId));
};

export const unlockShift = async (shiftId: string, userId: string) => {
  return db.update(shifts)
    .set({
      locked: false,
      status: 'CLOSED',
      lockedBy: userId,
    })
    .where(eq(shifts.id, shiftId));
};

export const updateShiftReading = async (
  shiftId: string,
  readingId: string,
  closingReading: number
) => {
  const reading = await db.query.nozzleReadings.findFirst({
    where: eq(nozzleReadings.id, readingId),
    with: {
      shift: true,
      nozzle: true
    }
  });

  if (!reading) {
    throw new Error('Reading not found');
  }

  if (reading.shiftId !== shiftId) {
    throw new Error('Reading does not belong to this shift');
  }

  if (reading.shift.locked) {
    throw new Error('Shift is locked');
  }

  const oldConsumption = reading.consumption || 0;
  const newConsumption = closingReading - reading.openingReading;

  if (newConsumption < 0) {
    throw new Error('Invalid reading');
  }

  const consumptionDiff = newConsumption - oldConsumption;

  // Update reading
  const [updatedReading] = await db.update(nozzleReadings)
    .set({
      closingReading,
      consumption: newConsumption,
    })
    .where(eq(nozzleReadings.id, readingId))
    .returning();

  // Adjust tank level
  await db.update(tanks)
    .set({ currentLevel: sql`${tanks.currentLevel} - ${consumptionDiff}` })
    .where(eq(tanks.id, reading.nozzle.tankId));

  return updatedReading;
};

export const recordTankerDelivery = async (data: {
  tankId: string;
  litersDelivered: number;
  deliveryDate: Date;
  deliveredBy: string;
  aramcoTicket?: string;
  notes?: string;
}) => {
  const tank = await db.query.tanks.findFirst({
    where: eq(tanks.id, data.tankId),
  });

  if (!tank) {
    throw new Error('Tank not found');
  }

  const currentLevel = tank.currentLevel || 0;
  const newLevel = currentLevel + data.litersDelivered;

  // Check capacity if set
  if (tank.capacity && newLevel > tank.capacity) {
    throw new Error(
      `Delivery exceeds tank capacity. ` +
      `Capacity: ${tank.capacity}L, Current: ${currentLevel}L, ` +
      `Delivery: ${data.litersDelivered}L, New Total: ${newLevel}L`
    );
  }

  return db.transaction(async (tx) => {
    const [delivery] = await tx.insert(tankerDeliveries).values({
      tankId: data.tankId,
      litersDelivered: data.litersDelivered,
      deliveryDate: data.deliveryDate,
      deliveredBy: data.deliveredBy,
      aramcoTicket: data.aramcoTicket,
      notes: data.notes,
    }).returning();

    const [updatedTank] = await tx.update(tanks)
      .set({ currentLevel: newLevel, updatedAt: new Date() })
      .where(eq(tanks.id, data.tankId))
      .returning();

    return { delivery, tank: updatedTank };
  });
};

export const getTankerDeliveries = async (tankId?: string) => {
  if (tankId) {
    return db.query.tankerDeliveries.findMany({
      where: eq(tankerDeliveries.tankId, tankId),
      with: {
        tank: true,
        deliveredBy: {
          columns: { id: true, name: true, employeeId: true },
        },
      },
      orderBy: [desc(tankerDeliveries.deliveryDate)],
    });
  }

  return db.query.tankerDeliveries.findMany({
    with: {
      tank: {
        with: {
          station: true,
        },
      },
      deliveredBy: {
        columns: { id: true, name: true, employeeId: true },
      },
    },
    orderBy: [desc(tankerDeliveries.deliveryDate)],
  });
};
