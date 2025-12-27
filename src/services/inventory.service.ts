import prisma from '../config/database';
import { ShiftStatus, ShiftType } from '@prisma/client';

export const getNozzlesByStation = async (stationId: string) => {
  return prisma.nozzle.findMany({
    where: { stationId },
    include: {
      tank: true,
    },
    orderBy: { name: 'asc' },
  });
};

export const getTanksByStation = async (stationId: string) => {
  return prisma.tank.findMany({
    where: { stationId },
    include: {
      nozzles: true,
      _count: {
        select: { nozzles: true },
      },
    },
  });
};

export const getCurrentShift = async (stationId: string) => {
  const now = new Date();
  const hour = now.getHours();
  const shiftType: ShiftType = hour >= 0 && hour < 12 ? ShiftType.DAY : ShiftType.NIGHT;

  // Calculate shift start time (midnight for DAY, noon for NIGHT)
  const shiftStart = new Date(now);
  shiftStart.setHours(shiftType === ShiftType.DAY ? 0 : 12, 0, 0, 0);

  // Find or create current shift
  let shift = await prisma.shift.findFirst({
    where: {
      stationId,
      shiftType,
      startTime: {
        gte: shiftStart,
        lt: new Date(shiftStart.getTime() + 12 * 60 * 60 * 1000),
      },
      status: { in: [ShiftStatus.OPEN, ShiftStatus.CLOSED] },
    },
    include: {
      shiftReadings: {
        include: {
          nozzle: true,
        },
      },
    },
  });

  if (!shift) {
    shift = await prisma.shift.create({
      data: {
        stationId,
        shiftType,
        startTime: shiftStart,
        status: ShiftStatus.OPEN,
      },
      include: {
        shiftReadings: {
          include: {
            nozzle: true,
          },
        },
      },
    });
  }

  return shift;
};

export const getShiftReadings = async (shiftId: string) => {
  return prisma.shiftReading.findMany({
    where: { shiftId },
    include: {
      nozzle: {
        include: {
          tank: true,
        },
      },
    },
  });
};

export const createShiftReadings = async (
  shiftId: string,
  stationId: string,
  readings: Array<{ nozzleId: string; closingReading: number }>
) => {
  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    include: { shiftReadings: true },
  });

  if (!shift) {
    throw new Error('Shift not found');
  }

  if (shift.locked) {
    throw new Error('Shift is locked');
  }

  // Get all nozzles for the station
  const nozzles = await prisma.nozzle.findMany({
    where: { stationId },
  });

  // Get previous shift's closing readings as opening readings
  const previousShift = await prisma.shift.findFirst({
    where: {
      stationId,
      id: { not: shiftId },
    },
    orderBy: { startTime: 'desc' },
    include: { shiftReadings: true },
  });

  const openingReadingsMap = new Map<string, number>();
  if (previousShift) {
    previousShift.shiftReadings.forEach((reading) => {
      if (reading.closingReading !== null) {
        openingReadingsMap.set(reading.nozzleId, reading.closingReading);
      }
    });
  }

  // Process readings and calculate consumption
  const results = [];
  const tankConsumptionMap = new Map<string, number>();

  for (const reading of readings) {
    const nozzle = nozzles.find((n) => n.id === reading.nozzleId);
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
    const shiftReading = await prisma.shiftReading.upsert({
      where: {
        shiftId_nozzleId: {
          shiftId,
          nozzleId: reading.nozzleId,
        },
      },
      update: {
        closingReading: reading.closingReading,
        consumption,
      },
      create: {
        shiftId,
        nozzleId: reading.nozzleId,
        openingReading,
        closingReading: reading.closingReading,
        consumption,
      },
    });

    results.push(shiftReading);
  }

  // Update tank levels (subtract consumption)
  for (const [tankId, consumption] of tankConsumptionMap.entries()) {
    await prisma.tank.update({
      where: { id: tankId },
      data: {
        currentLevel: {
          decrement: consumption,
        },
      },
    });
  }

  return results;
};

export const lockShift = async (shiftId: string) => {
  return prisma.shift.update({
    where: { id: shiftId },
    data: {
      locked: true,
      status: ShiftStatus.LOCKED,
    },
  });
};

export const unlockShift = async (shiftId: string, userId: string) => {
  return prisma.shift.update({
    where: { id: shiftId },
    data: {
      locked: false,
      status: ShiftStatus.CLOSED,
      lockedBy: userId,
    },
  });
};

export const updateShiftReading = async (
  shiftId: string,
  readingId: string,
  closingReading: number
) => {
  const reading = await prisma.shiftReading.findUnique({
    where: { id: readingId },
    include: {
      shift: true,
      nozzle: true,
    },
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
  const updatedReading = await prisma.shiftReading.update({
    where: { id: readingId },
    data: {
      closingReading,
      consumption: newConsumption,
    },
  });

  // Adjust tank level
  await prisma.tank.update({
    where: { id: reading.nozzle.tankId },
    data: {
      currentLevel: {
        decrement: consumptionDiff,
      },
    },
  });

  return updatedReading;
};

export const recordTankerDelivery = async (
  tankId: string,
  liters: number,
  recordedBy: string
) => {
  const tank = await prisma.tank.findUnique({
    where: { id: tankId },
  });

  if (!tank) {
    throw new Error('Tank not found');
  }

  if (tank.currentLevel + liters > tank.capacity) {
    throw new Error('Delivery exceeds tank capacity');
  }

  return prisma.$transaction([
    prisma.tankerDelivery.create({
      data: {
        tankId,
        liters,
        recordedBy,
      },
    }),
    prisma.tank.update({
      where: { id: tankId },
      data: {
        currentLevel: {
          increment: liters,
        },
      },
    }),
  ]);
};

