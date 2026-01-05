import db from '../config/database';
import { stations, nozzles, tanks, shifts, nozzleReadings, tankerDeliveries, dailyShiftReadings, paymentSummary, fuelPrices } from '../db/schema';
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
      inArray(shifts.status, ['OPEN', 'SAVED']),
      eq(shifts.locked, false)
    ),
    with: {
      dailyShiftReadings: {
        with: {
          nozzle: {
            with: {
              tank: true,
            },
          },
        },
        orderBy: (readings, { asc }) => [asc(readings.nozzleId)], // Order readings by nozzle
      },
      paymentSummary: true,
    },
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
      dailyShiftReadings: {
        with: {
          nozzle: true
        }
      },
      paymentSummary: true
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
  tankId?: string;
  stationId?: string;
  fuelType?: string;
  litersDelivered: number;
  deliveryDate: Date;
  deliveredBy: string;
  aramcoTicket?: string;
  notes?: string;
  receiptUrl?: string;
}) => {
  let targetTankId = data.tankId;

  // If no tank ID, find or create tank based on station and fuel type
  if (!targetTankId && data.stationId && data.fuelType) {
    const existingTank = await db.query.tanks.findFirst({
      where: and(
        eq(tanks.stationId, data.stationId),
        eq(tanks.fuelType, data.fuelType as any)
      ),
    });

    if (existingTank) {
      targetTankId = existingTank.id;
    } else {
      // Create new tank
      const [newTank] = await db.insert(tanks).values({
        stationId: data.stationId,
        fuelType: data.fuelType as any,
        capacity: 100000, // Default larger capacity
        currentLevel: 0,
      }).returning();
      targetTankId = newTank.id;
    }
  }

  if (!targetTankId) {
    throw new Error('Tank ID or Station ID + Fuel Type required');
  }

  const tank = await db.query.tanks.findFirst({
    where: eq(tanks.id, targetTankId),
  });

  if (!tank) {
    throw new Error('Tank not found');
  }

  const currentLevel = tank.currentLevel || 0;
  const newLevel = currentLevel + data.litersDelivered;

  return db.transaction(async (tx) => {
    const [delivery] = await tx.insert(tankerDeliveries).values({
      tankId: targetTankId, // Use the resolved tank ID
      litersDelivered: data.litersDelivered,
      deliveryDate: data.deliveryDate,
      deliveredBy: data.deliveredBy,
      aramcoTicket: data.aramcoTicket,
      notes: data.notes,
      receiptUrl: data.receiptUrl,
    }).returning();

    const [updatedTank] = await tx.update(tanks)
      .set({ currentLevel: newLevel, updatedAt: new Date() })
      .where(eq(tanks.id, targetTankId))
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
    },
    orderBy: [desc(tankerDeliveries.deliveryDate)],
  });
};

export const getDeliveriesByStation = async (stationId: string) => {
  const stationTanks = await db.select({ id: tanks.id }).from(tanks).where(eq(tanks.stationId, stationId));
  const tankIds = stationTanks.map(t => t.id);

  if (tankIds.length === 0) return [];

  return db.query.tankerDeliveries.findMany({
    where: inArray(tankerDeliveries.tankId, tankIds),
    with: {
      tank: {
        with: {
          station: true, // Include station information
        },
      },
      deliveredBy: {
        columns: { id: true, name: true, employeeId: true },
      },
    },
    orderBy: [desc(tankerDeliveries.deliveryDate)],
  });
};

// ==================== DAILY SHIFT SYSTEM ====================

/**
 * Create a new daily shift with readings for all nozzles
 */
export const createDailyShift = async (stationId: string, shiftDate: Date) => {
  // Check if there's already an open or saved shift for this date
  const existingShift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.stationId, stationId),
      inArray(shifts.status, ['OPEN', 'SAVED'])
    ),
  });

  if (existingShift) {
    throw new Error('There is already an open shift for this station. Please close it first.');
  }

  // Create new daily shift
  const [newShift] = await db.insert(shifts).values({
    stationId,
    shiftType: null, // Daily shifts don't have a type
    shiftDate,
    startTime: new Date(),
    status: 'OPEN',
    locked: false,
  }).returning();

  // Get all nozzles for the station
  const stationNozzles = await db.query.nozzles.findMany({
    where: eq(nozzles.stationId, stationId),
    orderBy: sql`${nozzles.name} asc`,
  });

  // Get current fuel prices for the station
  const prices = await db.query.fuelPrices.findMany({
    where: eq(fuelPrices.stationId, stationId),
    orderBy: [desc(fuelPrices.effectiveFrom)],
  });

  // Create a map of fuel type to price
  const priceMap = new Map<string, number>();
  prices.forEach(p => {
    if (!priceMap.has(p.fuelType)) {
      priceMap.set(p.fuelType, p.pricePerLiter);
    }
  });

  // Create daily shift readings for all nozzles
  const readingsToInsert = stationNozzles.map(nozzle => ({
    shiftId: newShift.id,
    nozzleId: nozzle.id,
    openingReading: nozzle.openingReading || 0,
    pricePerLiter: priceMap.get(nozzle.fuelType) || 0,
  }));

  if (readingsToInsert.length > 0) {
    await db.insert(dailyShiftReadings).values(readingsToInsert);
  }

  // Create empty payment summary
  await db.insert(paymentSummary).values({
    shiftId: newShift.id,
  });

  return newShift;
};

/**
 * Get daily shift with all readings
 */
export const getDailyShift = async (shiftId: string) => {
  return db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
    with: {
      dailyShiftReadings: {
        with: {
          nozzle: {
            with: {
              tank: true,
            },
          },
        },
      },
      paymentSummary: true,
    },
  });
};

/**
 * Update daily shift readings (Shift A and/or Shift B)
 */
export const updateDailyShiftReadings = async (
  shiftId: string,
  readings: Array<{
    id: string;
    shiftAReading?: number;
    shiftBReading?: number;
  }>
) => {
  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.locked) {
    throw new Error('Shift is locked and cannot be modified');
  }

  // Update each reading and calculate liters and amounts
  for (const reading of readings) {
    const existingReading = await db.query.dailyShiftReadings.findFirst({
      where: eq(dailyShiftReadings.id, reading.id),
    });

    if (!existingReading) {
      throw new Error(`Reading ${reading.id} not found`);
    }

    const shiftAReading = reading.shiftAReading ?? existingReading.shiftAReading;
    const shiftBReading = reading.shiftBReading ?? existingReading.shiftBReading;

    // Calculate liters
    const shiftALiters = shiftAReading ? shiftAReading - existingReading.openingReading : 0;
    const shiftBLiters = (shiftBReading && shiftAReading) ? shiftBReading - shiftAReading : 0;

    // Calculate amounts
    const shiftAAmount = shiftALiters * existingReading.pricePerLiter;
    const shiftBAmount = shiftBLiters * existingReading.pricePerLiter;
    const totalAmount = shiftAAmount + shiftBAmount;

    await db.update(dailyShiftReadings)
      .set({
        shiftAReading,
        shiftBReading,
        shiftALiters,
        shiftBLiters,
        shiftAAmount,
        shiftBAmount,
        totalAmount,
        updatedAt: new Date(),
      })
      .where(eq(dailyShiftReadings.id, reading.id));
  }

  // Update shift status to SAVED if it was OPEN
  if (shift.status === 'OPEN') {
    await db.update(shifts)
      .set({ status: 'SAVED', updatedAt: new Date() })
      .where(eq(shifts.id, shiftId));
  }

  return getDailyShift(shiftId);
};

/**
 * Save or update payment summary
 */
export const savePaymentSummary = async (
  shiftId: string,
  data: {
    cardAmount: number;
    cashAmount: number;
    option3Amount: number;
    option4Amount: number;
  }
) => {
  const shift = await db.query.shifts.findFirst({
    where: eq(shifts.id, shiftId),
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.locked) {
    throw new Error('Shift is locked and cannot be modified');
  }

  // Calculate totals
  const totalCollected = data.cardAmount + data.cashAmount + data.option3Amount + data.option4Amount;

  // Get total revenue from daily shift readings
  const readings = await db.query.dailyShiftReadings.findMany({
    where: eq(dailyShiftReadings.shiftId, shiftId),
  });

  const totalRevenue = readings.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
  const difference = totalRevenue - totalCollected;

  // Validate that total collected doesn't exceed total revenue
  if (totalCollected > totalRevenue) {
    throw new Error(`Total collected (${totalCollected}) cannot exceed total revenue (${totalRevenue})`);
  }

  // Update payment summary
  await db.update(paymentSummary)
    .set({
      cardAmount: data.cardAmount,
      cashAmount: data.cashAmount,
      option3Amount: data.option3Amount,
      option4Amount: data.option4Amount,
      totalCollected,
      difference,
      updatedAt: new Date(),
    })
    .where(eq(paymentSummary.shiftId, shiftId));

  return db.query.paymentSummary.findFirst({
    where: eq(paymentSummary.shiftId, shiftId),
  });
};

/**
 * Lock daily shift and update nozzle opening readings
 */
export const lockDailyShift = async (shiftId: string) => {
  const shift = await getDailyShift(shiftId);

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.locked) {
    throw new Error('Shift is already locked');
  }

  // Validate that all readings are complete
  const incompleteReadings = shift.dailyShiftReadings?.filter(
    r => !r.shiftAReading || !r.shiftBReading
  );

  if (incompleteReadings && incompleteReadings.length > 0) {
    throw new Error('All Shift A and Shift B readings must be entered before locking');
  }

  return db.transaction(async (tx) => {
    // Lock the shift
    await tx.update(shifts)
      .set({
        locked: true,
        status: 'LOCKED',
        lockedAt: new Date(),
        endTime: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(shifts.id, shiftId));

    // Update nozzle opening readings to Shift B readings
    if (shift.dailyShiftReadings) {
      for (const reading of shift.dailyShiftReadings) {
        if (reading.shiftBReading) {
          await tx.update(nozzles)
            .set({
              openingReading: reading.shiftBReading,
              updatedAt: new Date(),
            })
            .where(eq(nozzles.id, reading.nozzleId));
        }
      }
    }

    // Update tank levels (subtract total consumption)
    const tankConsumptionMap = new Map<string, number>();
    let totalLitersSold = 0;

    if (shift.dailyShiftReadings) {
      for (const reading of shift.dailyShiftReadings) {
        const nozzle = reading.nozzle;
        const totalLiters = (reading.shiftALiters || 0) + (reading.shiftBLiters || 0);
        totalLitersSold += totalLiters;
        const currentConsumption = tankConsumptionMap.get(nozzle.tankId) || 0;
        tankConsumptionMap.set(nozzle.tankId, currentConsumption + totalLiters);
      }
    }

    for (const [tankId, consumption] of tankConsumptionMap.entries()) {
      await tx.update(tanks)
        .set({ currentLevel: sql`${tanks.currentLevel} - ${consumption}` })
        .where(eq(tanks.id, tankId));
    }

    // Create cash transaction
    const totalRevenue = shift.dailyShiftReadings?.reduce((sum, r) => sum + (r.totalAmount || 0), 0) || 0;
    const paymentSum = shift.paymentSummary;

    if (paymentSum) {
      const { cashTransactions } = await import('../db/schema');

      await tx.insert(cashTransactions).values({
        shiftId: shift.id,
        stationId: shift.stationId,
        litersSold: totalLitersSold,
        ratePerLiter: totalRevenue / (totalLitersSold || 1), // Average rate
        totalRevenue,
        cardPayments: paymentSum.cardAmount || 0,
        cashOnHand: paymentSum.cashAmount || 0,
        option3Payments: paymentSum.option3Amount || 0,
        option4Payments: paymentSum.option4Amount || 0,
        bankDeposit: 0,
        cashToAM: paymentSum.cashAmount || 0, // Cash amount goes to AM
        status: 'PENDING_ACCEPTANCE',
      });
    }

    return getDailyShift(shiftId);
  });
};

/**
 * Update nozzle opening reading (Admin only)
 */
export const updateNozzleOpeningReading = async (
  nozzleId: string,
  newReading: number
) => {
  const nozzle = await db.query.nozzles.findFirst({
    where: eq(nozzles.id, nozzleId),
  });

  if (!nozzle) {
    throw new Error('Nozzle not found');
  }

  const [updatedNozzle] = await db.update(nozzles)
    .set({
      openingReading: newReading,
      updatedAt: new Date(),
    })
    .where(eq(nozzles.id, nozzleId))
    .returning();

  return updatedNozzle;
};

export const getAdminStationStats = async () => {
  // Get all stations
  const allStations = await db.select().from(stations).orderBy(stations.name);

  try {
    // Calculate total revenue per station
    const salesByStation = await db
      .select({
        stationId: shifts.stationId,
        totalRevenue: sql<number>`sum(${dailyShiftReadings.totalAmount})`,
        totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
      })
      .from(dailyShiftReadings)
      .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
      .groupBy(shifts.stationId);

    // Map results to stations
    const stats = allStations.map(station => {
      const sale = salesByStation.find(s => s.stationId === station.id);
      return {
        ...station,
        totalRevenue: Number(sale?.totalRevenue || 0),
        totalLiters: Number(sale?.totalLiters || 0),
      };
    });

    return stats;
  } catch (error) {
    console.error('Error calculating stats:', error);
    // If query fails (e.g. no readings), return 0 stats
    return allStations.map(s => ({ ...s, totalRevenue: 0, totalLiters: 0 }));
  }
};

export const getStationStats = async (stationId: string) => {
  const result = await db
    .select({
      totalRevenue: sql<number>`sum(${dailyShiftReadings.totalAmount})`,
      totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
    })
    .from(dailyShiftReadings)
    .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
    .where(eq(shifts.stationId, stationId));

  return {
    totalRevenue: Number(result[0]?.totalRevenue || 0),
    totalLiters: Number(result[0]?.totalLiters || 0),
  };
};

