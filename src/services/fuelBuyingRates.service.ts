import db from '../config/database';
import { fuelBuyingRates } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Set or update buying rate for a station and fuel type
export const setBuyingRate = async (data: {
    stationId: string;
    fuelType: string;
    buyingPricePerLiter: number;
    createdBy: string;
}) => {
    return db.insert(fuelBuyingRates).values({
        stationId: data.stationId,
        fuelType: data.fuelType as any,
        buyingPricePerLiter: data.buyingPricePerLiter,
        createdBy: data.createdBy,
    }).returning();
};

// Get current buying rates for a station
export const getCurrentBuyingRates = async (stationId: string) => {
    // Get latest rate for each fuel type
    const rates = await db.query.fuelBuyingRates.findMany({
        where: eq(fuelBuyingRates.stationId, stationId),
        orderBy: [desc(fuelBuyingRates.effectiveFrom)],
    });

    // Group by fuel type and get the most recent
    const latestRates: Record<string, any> = {};
    rates.forEach(rate => {
        if (!latestRates[rate.fuelType]) {
            latestRates[rate.fuelType] = rate;
        }
    });

    return Object.values(latestRates);
};

// Get current buying rate for specific station and fuel type
export const getBuyingRate = async (stationId: string, fuelType: string) => {
    const rate = await db.query.fuelBuyingRates.findFirst({
        where: and(
            eq(fuelBuyingRates.stationId, stationId),
            eq(fuelBuyingRates.fuelType, fuelType as any)
        ),
        orderBy: [desc(fuelBuyingRates.effectiveFrom)],
    });

    return rate;
};

// Get all buying rates (for admin view)
export const getAllBuyingRates = async () => {
    return db.query.fuelBuyingRates.findMany({
        with: {
            station: true,
        },
        orderBy: [desc(fuelBuyingRates.effectiveFrom)],
    });
};

// Get buying rate history for a station and fuel type
export const getBuyingRateHistory = async (stationId: string, fuelType: string) => {
    return db.query.fuelBuyingRates.findMany({
        where: and(
            eq(fuelBuyingRates.stationId, stationId),
            eq(fuelBuyingRates.fuelType, fuelType as any)
        ),
        orderBy: [desc(fuelBuyingRates.effectiveFrom)],
        with: {
            createdByUser: {
                columns: {
                    id: true,
                    name: true,
                    employeeId: true,
                }
            }
        }
    });
};
