import db from '../config/database';
import { stations, nozzles, tanks, shifts, nozzleReadings, tankerDeliveries, dailyShiftReadings, paymentSummary, fuelPrices, purchaseOrders } from '../db/schema';
import { eq, and, desc, inArray, gte, lt, ne, sql } from 'drizzle-orm';

export const getNozzlesByStation = async (stationId: string) => {
  return db.query.nozzles.findMany({
    where: eq(nozzles.stationId, stationId),
    with: {
      tank: true,
    },
    orderBy: (nozzles, { asc }) => [asc(nozzles.displayOrder), asc(nozzles.createdAt)],
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
  // Include CLOSED shifts that are unlocked (when admin unlocks a LOCKED shift, it becomes CLOSED with locked: false)
  const shift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.stationId, stationId),
      inArray(shifts.status, ['OPEN', 'SAVED', 'CLOSED']),
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
      },
      paymentSummary: true,
    },
    orderBy: [desc(shifts.startTime)],
  });

  if (!shift) return null;

  // Sort dailyShiftReadings by nozzle displayOrder to maintain consistent sequence
  if (shift.dailyShiftReadings) {
    shift.dailyShiftReadings.sort((a, b) => {
      const orderA = a.nozzle.displayOrder || 999999;
      const orderB = b.nozzle.displayOrder || 999999;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      // Fallback to createdAt if displayOrder is the same
      const timeA = a.nozzle.createdAt ? new Date(a.nozzle.createdAt).getTime() : 0;
      const timeB = b.nozzle.createdAt ? new Date(b.nozzle.createdAt).getTime() : 0;
      return timeA - timeB;
    });
  }

  return shift;
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
    orderBy: (nozzles, { asc }) => [asc(nozzles.displayOrder), asc(nozzles.createdAt)],
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

  // 1. Find the latest delivery for this tank to determine period start
  const lastDelivery = await db.query.tankerDeliveries.findFirst({
    where: eq(tankerDeliveries.tankId, targetTankId),
    orderBy: [desc(tankerDeliveries.deliveryDate)],
  });

  // 2. Calculate consumption (sales) since the last delivery
  let consumption = 0;
  if (lastDelivery) {
    const consumptionResult = await db
      .select({
        totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
      })
      .from(dailyShiftReadings)
      .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
      .innerJoin(nozzles, eq(dailyShiftReadings.nozzleId, nozzles.id))
      .where(
        and(
          eq(nozzles.tankId, targetTankId),
          gte(shifts.shiftDate, lastDelivery.deliveryDate),
          lt(shifts.shiftDate, data.deliveryDate)
        )
      );

    consumption = Number(consumptionResult[0]?.totalLiters || 0);
  }

  // 3. Determine opening balance
  // If we have a previous delivery, the opening balance is the total liters after that delivery (including its consumption)
  // Formula: Opening_N = Total_N-1 = (Opening_N-1 + Delivered_N-1) - Consumption_since_N-2_to_N-1
  // Actually, opening balance "at the time of delivery" could just be the current level.
  // But to satisfy the user's formula (Total = Opening + Delivery - Consumption), 
  // the Opening must be the balance from the START of the window.

  const currentLevel = tank.currentLevel || 0;
  let openingBalance = currentLevel;

  if (lastDelivery) {
    // If we have a previous delivery, opening balance is the total from that delivery
    openingBalance = (lastDelivery.openingBalance || 0) + (lastDelivery.litersDelivered || 0) - (lastDelivery.consumption || 0);
  } else {
    // For the first delivery in the system, we treat the current level as the opening balance
    // and assume consumption uptil now is 0 or already accounted for.
    openingBalance = currentLevel;
  }

  const newLevel = currentLevel + data.litersDelivered;

  return db.transaction(async (tx) => {
    const [delivery] = await tx.insert(tankerDeliveries).values({
      tankId: targetTankId,
      litersDelivered: data.litersDelivered,
      deliveryDate: data.deliveryDate,
      openingBalance: openingBalance,
      consumption: consumption,
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

export const updateTankerDelivery = async (
  deliveryId: string,
  updates: Partial<{
    litersDelivered: number;
    deliveryDate: Date;
    aramcoTicket: string;
    invoiceNumber: string;
    notes: string;
    receiptUrl: string;
  }>,
  userRole: string
) => {
  const delivery = await db.query.tankerDeliveries.findFirst({
    where: eq(tankerDeliveries.id, deliveryId),
    with: { tank: true }
  });

  if (!delivery) throw new Error('Delivery not found');

  if (userRole !== 'Admin' && !delivery.isUnlocked) {
    throw new Error('You do not have permission to edit this delivery');
  }

  // Calculate difference if liters changed to update tank level
  let literDiff = 0;
  if (updates.litersDelivered !== undefined) {
    literDiff = updates.litersDelivered - delivery.litersDelivered;
  }

  return db.transaction(async (tx) => {
    const [updatedDelivery] = await tx.update(tankerDeliveries)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tankerDeliveries.id, deliveryId))
      .returning();

    if (literDiff !== 0) {
      await tx.update(tanks)
        .set({ currentLevel: sql`${tanks.currentLevel} + ${literDiff}` })
        .where(eq(tanks.id, delivery.tankId));
    }

    return updatedDelivery;
  });
};

export const toggleTankerLock = async (deliveryId: string, isUnlocked: boolean) => {
  return db.update(tankerDeliveries)
    .set({ isUnlocked, updatedAt: new Date() })
    .where(eq(tankerDeliveries.id, deliveryId))
    .returning();
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

  // Use manual select to join with purchase orders and get fuel type
  const deliveries = await db.select({
    id: tankerDeliveries.id,
    tankId: tankerDeliveries.tankId,
    litersDelivered: tankerDeliveries.litersDelivered,
    deliveryDate: tankerDeliveries.deliveryDate,
    openingBalance: tankerDeliveries.openingBalance,
    consumption: tankerDeliveries.consumption,
    aramcoTicket: sql<string>`COALESCE(${purchaseOrders.invoiceNumber}, ${tankerDeliveries.aramcoTicket})`,
    invoiceNumber: purchaseOrders.invoiceNumber,
    receiptUrl: tankerDeliveries.receiptUrl,
    notes: tankerDeliveries.notes,
    isUnlocked: tankerDeliveries.isUnlocked,
    createdAt: tankerDeliveries.createdAt,
    fuelType: tanks.fuelType,
    deliveredBy: tankerDeliveries.deliveredBy,
  })
    .from(tankerDeliveries)
    .innerJoin(tanks, eq(tankerDeliveries.tankId, tanks.id))
    .leftJoin(purchaseOrders, eq(tankerDeliveries.purchaseOrderId, purchaseOrders.id))
    .where(inArray(tankerDeliveries.tankId, tankIds))
    .orderBy(desc(tankerDeliveries.deliveryDate));

  return deliveries;
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
    orderBy: (nozzles, { asc }) => [asc(nozzles.displayOrder), asc(nozzles.createdAt)],
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
    shiftAPhotoUrl?: string; // Optional photo for Shift A
    shiftBPhotoUrl?: string; // Optional photo for Shift B
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
      with: { nozzle: true } // Fetch nozzle to get name for error message
    });

    if (!existingReading) {
      throw new Error(`Reading ${reading.id} not found`);
    }

    const shiftAReading = reading.shiftAReading ?? existingReading.shiftAReading;
    const shiftBReading = reading.shiftBReading ?? existingReading.shiftBReading;

    // VALIDATION LOGIC
    // 1. Shift A Reading cannot be lower than Opening Reading
    if (shiftAReading && shiftAReading < existingReading.openingReading) {
      throw new Error(`Shift A reading for ${existingReading.nozzle.name} cannot be lower than opening reading (${existingReading.openingReading})`);
    }

    // 2. Shift B Reading cannot be lower than Shift A Reading (if exists) or Opening Reading
    const previousReading = shiftAReading || existingReading.openingReading;
    if (shiftBReading && shiftBReading < previousReading) {
      throw new Error(`Shift B reading for ${existingReading.nozzle.name} cannot be lower than previous reading (${previousReading})`);
    }

    // Calculate liters
    const shiftALiters = shiftAReading ? shiftAReading - existingReading.openingReading : 0;
    const shiftBLiters = (shiftBReading && shiftAReading) ? shiftBReading - shiftAReading : 0;

    // Calculate amounts
    const shiftAAmount = shiftALiters * existingReading.pricePerLiter;
    const shiftBAmount = shiftBLiters * existingReading.pricePerLiter;
    const totalAmount = shiftAAmount + shiftBAmount;

    const updateData: any = {
      shiftAReading,
      shiftBReading,
      shiftALiters,
      shiftBLiters,
      shiftAAmount,
      shiftBAmount,
      totalAmount,
      updatedAt: new Date(),
    };

    if (reading.shiftAPhotoUrl !== undefined) updateData.shiftAPhotoUrl = reading.shiftAPhotoUrl;
    if (reading.shiftBPhotoUrl !== undefined) updateData.shiftBPhotoUrl = reading.shiftBPhotoUrl;

    await db.update(dailyShiftReadings)
      .set(updateData)
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
export const lockDailyShift = async (shiftId: string, userId?: string) => {
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

    // Create or update cash transaction
    const totalRevenue = shift.dailyShiftReadings?.reduce((sum, r) => sum + (r.totalAmount || 0), 0) || 0;
    const paymentSum = shift.paymentSummary;

    if (paymentSum) {
      const { cashTransactions, cashTransfers, users } = await import('../db/schema');

      // Check if cash transaction already exists for this shift (in case of re-locking after unlock)
      const existingTransaction = await tx.query.cashTransactions.findFirst({
        where: eq(cashTransactions.shiftId, shift.id),
      });

      let transactionId: string;

      if (existingTransaction) {
        // Update existing transaction instead of creating a new one
        await tx.update(cashTransactions)
          .set({
            litersSold: totalLitersSold,
            ratePerLiter: totalRevenue / (totalLitersSold || 1),
            totalRevenue,
            cardPayments: paymentSum.cardAmount || 0,
            cashOnHand: paymentSum.cashAmount || 0,
            option3Payments: paymentSum.option3Amount || 0,
            option4Payments: paymentSum.option4Amount || 0,
            cashToAM: paymentSum.cashAmount || 0,
            status: 'PENDING_ACCEPTANCE',
            updatedAt: new Date(),
          })
          .where(eq(cashTransactions.id, existingTransaction.id));

        transactionId = existingTransaction.id;
      } else {
        // Create new transaction
        const [newTransaction] = await tx.insert(cashTransactions).values({
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
        }).returning();

        transactionId = newTransaction.id;
      }

      if (userId) {
        // Find the user's Area Manager
        const user = await tx.query.users.findFirst({
          where: eq(users.id, userId),
          columns: { areaManagerId: true }
        });

        if (user?.areaManagerId) {
          // Check if cash transfer already exists
          const existingTransfer = await tx.query.cashTransfers.findFirst({
            where: eq(cashTransfers.cashTransactionId, transactionId),
          });

          if (existingTransfer) {
            // Update existing transfer
            await tx.update(cashTransfers)
              .set({
                fromUserId: userId,
                toUserId: user.areaManagerId,
                status: 'PENDING_ACCEPTANCE',
                updatedAt: new Date(),
              })
              .where(eq(cashTransfers.id, existingTransfer.id));
          } else {
            // Create new transfer
            await tx.insert(cashTransfers).values({
              cashTransactionId: transactionId,
              fromUserId: userId,
              toUserId: user.areaManagerId,
              status: 'PENDING_ACCEPTANCE',
            });
          }
        }
      }
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

export const getAdminStationStats = async (filters?: {
  date?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  userRole?: string;
}) => {
  // Get stations based on user role
  let allStations: any[];

  if ((filters?.userRole === 'OU' || filters?.userRole === 'ViewOnly' || filters?.userRole === 'Accountant' || filters?.userRole === 'Procurement') && filters?.userId) {
    // Office User - only get assigned stations
    const { getAccessibleStationIds } = await import('../services/officeUser.service');
    const accessibleStationIds = await getAccessibleStationIds(filters.userId);

    if (accessibleStationIds === 'all') {
      allStations = await db.select().from(stations).orderBy(stations.name);
    } else if (Array.isArray(accessibleStationIds) && accessibleStationIds.length > 0) {
      allStations = await db.select().from(stations)
        .where(inArray(stations.id, accessibleStationIds))
        .orderBy(stations.name);
    } else {
      // No stations assigned - return empty array
      allStations = [];
    }
  } else {
    // Admin or other roles - get all stations
    allStations = await db.select().from(stations).orderBy(stations.name);
  }

  try {
    // Build WHERE conditions for date filtering
    let whereCondition = undefined;

    if (filters?.date) {
      // Single date filter - match shifts on this specific date
      const targetDate = new Date(filters.date);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      whereCondition = and(
        sql`${shifts.shiftDate} >= ${targetDate.toISOString()}`,
        sql`${shifts.shiftDate} < ${nextDate.toISOString()}`
      );
    } else if (filters?.startDate && filters?.endDate) {
      // Date range filter
      const start = new Date(filters.startDate);
      const end = new Date(filters.endDate);
      end.setDate(end.getDate() + 1); // Include end date

      whereCondition = and(
        sql`${shifts.shiftDate} >= ${start.toISOString()}`,
        sql`${shifts.shiftDate} < ${end.toISOString()}`
      );
    }

    // Calculate total revenue per station with optional date filter
    const salesByStation = whereCondition
      ? await db
        .select({
          stationId: shifts.stationId,
          totalRevenue: sql<number>`sum(${dailyShiftReadings.totalAmount})`,
          totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
        })
        .from(dailyShiftReadings)
        .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
        .where(whereCondition)
        .groupBy(shifts.stationId)
      : await db
        .select({
          stationId: shifts.stationId,
          totalRevenue: sql<number>`sum(${dailyShiftReadings.totalAmount})`,
          totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
        })
        .from(dailyShiftReadings)
        .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
        .groupBy(shifts.stationId);

    // Calculate fuel type breakdown per station
    const fuelBreakdownByStation = whereCondition
      ? await db
        .select({
          stationId: shifts.stationId,
          fuelType: nozzles.fuelType,
          totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
          totalAmount: sql<number>`sum(${dailyShiftReadings.totalAmount})`,
        })
        .from(dailyShiftReadings)
        .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
        .innerJoin(nozzles, eq(dailyShiftReadings.nozzleId, nozzles.id))
        .where(whereCondition)
        .groupBy(shifts.stationId, nozzles.fuelType)
      : await db
        .select({
          stationId: shifts.stationId,
          fuelType: nozzles.fuelType,
          totalLiters: sql<number>`sum(${dailyShiftReadings.shiftALiters} + ${dailyShiftReadings.shiftBLiters})`,
          totalAmount: sql<number>`sum(${dailyShiftReadings.totalAmount})`,
        })
        .from(dailyShiftReadings)
        .innerJoin(shifts, eq(dailyShiftReadings.shiftId, shifts.id))
        .innerJoin(nozzles, eq(dailyShiftReadings.nozzleId, nozzles.id))
        .groupBy(shifts.stationId, nozzles.fuelType);

    // Map results to stations
    const stats = allStations.map(station => {
      const sale = salesByStation.find(s => s.stationId === station.id);

      // Get fuel type breakdown for this station
      const fuelBreakdown = fuelBreakdownByStation.filter(f => f.stationId === station.id);
      const gasoline91 = fuelBreakdown.find(f => f.fuelType === '91_GASOLINE');
      const gasoline95 = fuelBreakdown.find(f => f.fuelType === '95_GASOLINE');
      const gasoline98 = fuelBreakdown.find(f => f.fuelType === '98_GASOLINE');
      const diesel = fuelBreakdown.find(f => f.fuelType === 'DIESEL');

      return {
        ...station,
        totalRevenue: Number(sale?.totalRevenue || 0),
        totalLiters: Number(sale?.totalLiters || 0),
        fuelBreakdown: {
          gasoline91: {
            liters: Number(gasoline91?.totalLiters || 0),
            amount: Number(gasoline91?.totalAmount || 0),
          },
          gasoline95: {
            liters: Number(gasoline95?.totalLiters || 0),
            amount: Number(gasoline95?.totalAmount || 0),
          },
          gasoline98: {
            liters: Number(gasoline98?.totalLiters || 0),
            amount: Number(gasoline98?.totalAmount || 0),
          },
          diesel: {
            liters: Number(diesel?.totalLiters || 0),
            amount: Number(diesel?.totalAmount || 0),
          },
        },
      };
    });

    return stats;
  } catch (error) {
    console.error('Error calculating stats:', error);
    // If query fails (e.g. no readings), return 0 stats
    return allStations.map(s => ({
      ...s,
      totalRevenue: 0,
      totalLiters: 0,
      fuelBreakdown: {
        gasoline91: { liters: 0, amount: 0 },
        gasoline95: { liters: 0, amount: 0 },
        gasoline98: { liters: 0, amount: 0 },
        diesel: { liters: 0, amount: 0 },
      },
    }));
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

// ==================== NOZZLE MANAGEMENT SERVICES ====================

export const updateNozzle = async (nozzleId: string, data: { name?: string; fuelType?: string }) => {
  const updateData: any = {};

  if (data.name !== undefined) {
    updateData.name = data.name;
  }

  if (data.fuelType !== undefined) {
    updateData.fuelType = data.fuelType;
  }

  if (Object.keys(updateData).length === 0) {
    throw new Error('No fields to update');
  }

  const [updatedNozzle] = await db
    .update(nozzles)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(nozzles.id, nozzleId))
    .returning();

  if (!updatedNozzle) {
    throw new Error('Nozzle not found');
  }

  return updatedNozzle;
};

export const addNozzle = async (data: {
  stationId: string;
  name: string;
  fuelType: string;
  openingReading: number;
}) => {
  // First, find or create a tank for this station and fuel type
  let tankId: string;

  const existingTank = await db.query.tanks.findFirst({
    where: and(
      eq(tanks.stationId, data.stationId),
      eq(tanks.fuelType, data.fuelType as any)
    ),
  });

  if (existingTank) {
    tankId = existingTank.id;
  } else {
    // Create new tank
    const [newTank] = await db.insert(tanks).values({
      stationId: data.stationId,
      fuelType: data.fuelType as any,
      capacity: 100000, // Default capacity
      currentLevel: 0,
    }).returning();
    tankId = newTank.id;
  }

  const [newNozzle] = await db
    .insert(nozzles)
    .values({
      stationId: data.stationId,
      tankId: tankId,
      name: data.name,
      fuelType: data.fuelType as any,
      openingReading: data.openingReading,
    })
    .returning();

  return newNozzle;
};

export const deleteNozzle = async (nozzleId: string) => {
  const [deletedNozzle] = await db
    .delete(nozzles)
    .where(eq(nozzles.id, nozzleId))
    .returning();

  if (!deletedNozzle) {
    throw new Error('Nozzle not found');
  }

  return deletedNozzle;
};

