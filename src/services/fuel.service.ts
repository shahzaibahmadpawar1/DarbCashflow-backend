import db from '../config/database';
import { fuelPrices, nozzleSales, nozzles, tanks, shifts, cashTransactions } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

// ==================== FUEL PRICES (Admin) ====================

export const setFuelPrice = async (data: {
    stationId: string;
    fuelType: string;
    pricePerLiter: number;
    createdBy: string;
}) => {
    return db.insert(fuelPrices).values({
        stationId: data.stationId,
        fuelType: data.fuelType as any,
        pricePerLiter: data.pricePerLiter,
        createdBy: data.createdBy,
    }).returning();
};

export const getCurrentFuelPrices = async (stationId: string) => {
    // Get latest price for each fuel type
    const prices = await db.query.fuelPrices.findMany({
        where: eq(fuelPrices.stationId, stationId),
        orderBy: [desc(fuelPrices.effectiveFrom)],
    });

    // Group by fuel type and get the most recent
    const latestPrices: Record<string, any> = {};
    prices.forEach(price => {
        if (!latestPrices[price.fuelType]) {
            latestPrices[price.fuelType] = price;
        }
    });

    return Object.values(latestPrices);
};

export const getAllStationPrices = async () => {
    return db.query.fuelPrices.findMany({
        with: {
            station: true,
        },
        orderBy: [desc(fuelPrices.effectiveFrom)],
    });
};

// ==================== NOZZLE SALES (Station Manager) ====================

export const initializeNozzleSales = async (shiftId: string, stationId: string) => {
    // Get all nozzles for this station
    let stationNozzles = await db.query.nozzles.findMany({
        where: eq(nozzles.stationId, stationId),
        with: {
            tank: true,
        },
    });

    // AUTO-INITIALIZE IF EMPTY: Create default tanks and nozzles
    if (stationNozzles.length === 0) {
        const fuelTypes = ['91_GASOLINE', '95_GASOLINE', 'DIESEL'];

        for (const fuelType of fuelTypes) {
            // Check if tank exists
            let tank = await db.query.tanks.findFirst({
                where: and(
                    eq(tanks.stationId, stationId),
                    eq(tanks.fuelType, fuelType as any)
                )
            });

            if (!tank) {
                // Create tank (without status field as it doesn't exist in schema)
                const [newTank] = await db.insert(tanks).values({
                    stationId,
                    fuelType: fuelType as any,
                    capacity: 100000,
                    currentLevel: 0,
                }).returning();
                tank = newTank;
            }

            // Create default nozzles (2 for each fuel type)
            const prefix = fuelType === '91_GASOLINE' ? '91' : (fuelType === '95_GASOLINE' ? '95' : 'D');

            await db.insert(nozzles).values([
                { stationId, tankId: tank.id, fuelType: fuelType as any, name: `${prefix}-1` },
                { stationId, tankId: tank.id, fuelType: fuelType as any, name: `${prefix}-2` }
            ]);
        }

        // Re-fetch nozzles
        stationNozzles = await db.query.nozzles.findMany({
            where: eq(nozzles.stationId, stationId),
            with: { tank: true },
        });
    }

    // Get current fuel prices for the station
    const currentPrices = await getCurrentFuelPrices(stationId);
    const priceMap: Record<string, number> = {};
    currentPrices.forEach(p => {
        priceMap[p.fuelType] = p.pricePerLiter;
    });

    // Create nozzle sales records
    const salesToCreate = stationNozzles.map(nozzle => ({
        shiftId,
        nozzleId: nozzle.id,
        quantityLiters: 0,
        pricePerLiter: priceMap[nozzle.fuelType] || 0, // Default to 0 if no price set
        cardAmount: 0,
        cashAmount: 0,
    }));

    if (salesToCreate.length > 0) {
        await db.insert(nozzleSales).values(salesToCreate);
    }

    return salesToCreate;
};

export const getNozzleSales = async (shiftId: string) => {
    return db.query.nozzleSales.findMany({
        where: eq(nozzleSales.shiftId, shiftId),
        with: {
            nozzle: {
                with: {
                    tank: true,
                },
            },
        },
    });
};

export const updateNozzleSale = async (
    saleId: string,
    data: {
        quantityLiters?: number;
        cardAmount?: number;
        cashAmount?: number;
    }
) => {
    return db.update(nozzleSales)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(eq(nozzleSales.id, saleId))
        .returning();
};

export const updateShiftPayments = async (
    shiftId: string,
    data: {
        cardAmount?: number;
        cashAmount?: number;
    }
) => {
    // Update all nozzle sales for this shift with the same card/cash amounts
    return db.update(nozzleSales)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(eq(nozzleSales.shiftId, shiftId))
        .returning();
};

export const submitNozzleSales = async (shiftId: string) => {
    // Get all sales for this shift
    const sales = await getNozzleSales(shiftId);

    if (sales.length === 0) {
        throw new Error('No sales data found for this shift');
    }

    // Get shift details to get stationId
    const shift = await db.query.shifts.findFirst({
        where: eq(shifts.id, shiftId),
    });

    if (!shift) {
        throw new Error('Shift not found');
    }

    // Calculate totals from sales
    let totalLiters = 0;
    let totalRevenue = 0;

    // Card and Cash amounts are stored as SHIFT totals on each nozzle record, so we take the first one
    // instead of summing them up (which would multiply by nozzle count)
    const totalCardAmount = sales.length > 0 ? (sales[0].cardAmount || 0) : 0;
    const totalCashAmount = sales.length > 0 ? (sales[0].cashAmount || 0) : 0;

    for (const sale of sales) {
        totalLiters += sale.quantityLiters;
        totalRevenue += sale.quantityLiters * sale.pricePerLiter;
    }

    // Calculate average rate per liter
    const avgRatePerLiter = totalLiters > 0 ? totalRevenue / totalLiters : 0;

    // Cash to AM = Total Cash Amount (cash collected during shift)
    const cashToAM = totalCashAmount;

    // Update tank levels
    for (const sale of sales) {
        const newLevel = (sale.nozzle.tank.currentLevel || 0) - sale.quantityLiters;

        if (newLevel < 0) {
            throw new Error(
                `Insufficient fuel in ${sale.nozzle.tank.fuelType} tank. ` +
                `Current: ${sale.nozzle.tank.currentLevel}L, Needed: ${sale.quantityLiters}L`
            );
        }

        await db.update(tanks)
            .set({ currentLevel: newLevel, updatedAt: new Date() })
            .where(eq(tanks.id, sale.nozzle.tank.id));
    }

    // Lock the shift
    await db.update(shifts)
        .set({
            status: 'CLOSED',
            locked: true,
            lockedAt: new Date(),
            endTime: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(shifts.id, shiftId));

    // Create cash transaction automatically
    const [cashTransaction] = await db.insert(cashTransactions).values({
        shiftId: shiftId,
        stationId: shift.stationId,
        litersSold: totalLiters,
        ratePerLiter: avgRatePerLiter,
        totalRevenue: totalRevenue,
        cardPayments: totalCardAmount,
        cashOnHand: totalCashAmount,
        bankDeposit: 0, // Will be updated later
        cashToAM: cashToAM,
        status: 'PENDING_ACCEPTANCE',
    }).returning();

    return { success: true, sales, cashTransaction };
};
