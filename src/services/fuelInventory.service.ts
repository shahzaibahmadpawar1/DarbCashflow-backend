import db from '../config/database';
import { tankerDeliveries, tanks, stations } from '../db/schema';
import { eq, and, gte, lte, sql } from 'drizzle-orm';

export const getFuelTankInventorySummary = async (dateFilter?: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string }) => {
    let whereClause: any = undefined;

    // Date filtering
    if (dateFilter) {
        if (dateFilter.type === 'single' && dateFilter.date) {
            const startOfDay = new Date(dateFilter.date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateFilter.date);
            endOfDay.setHours(23, 59, 59, 999);

            whereClause = and(
                gte(tankerDeliveries.deliveryDate, startOfDay),
                lte(tankerDeliveries.deliveryDate, endOfDay)
            );
        } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
            const startOfRange = new Date(dateFilter.startDate);
            startOfRange.setHours(0, 0, 0, 0);
            const endOfRange = new Date(dateFilter.endDate);
            endOfRange.setHours(23, 59, 59, 999);

            whereClause = and(
                gte(tankerDeliveries.deliveryDate, startOfRange),
                lte(tankerDeliveries.deliveryDate, endOfRange)
            );
        }
    }

    // Get all deliveries with tank and station info
    const deliveries = await db.query.tankerDeliveries.findMany({
        where: whereClause,
        with: {
            tank: {
                with: {
                    station: true
                }
            }
        },
        orderBy: (tankerDeliveries, { desc }) => [desc(tankerDeliveries.deliveryDate)]
    });

    // Group by fuel type
    const summary: Record<string, any> = {
        '91_GASOLINE': {
            totalLiters: 0,
            deliveryCount: 0,
            stations: [] as any[]
        },
        '95_GASOLINE': {
            totalLiters: 0,
            deliveryCount: 0,
            stations: [] as any[]
        },
        '98_GASOLINE': {
            totalLiters: 0,
            deliveryCount: 0,
            stations: [] as any[]
        },
        'DIESEL': {
            totalLiters: 0,
            deliveryCount: 0,
            stations: [] as any[]
        }
    };

    // Process deliveries
    deliveries.forEach(delivery => {
        const fuelType = delivery.tank.fuelType;

        if (summary[fuelType]) {
            summary[fuelType].totalLiters += Number(delivery.litersDelivered);
            summary[fuelType].deliveryCount += 1;

            // Add to stations list
            summary[fuelType].stations.push({
                deliveryId: delivery.id,
                stationId: delivery.tank.stationId,
                stationName: delivery.tank.station.name,
                litersDelivered: delivery.litersDelivered,
                deliveryDate: delivery.deliveryDate,
                aramcoTicket: delivery.aramcoTicket,
                receiptUrl: delivery.receiptUrl,
                notes: delivery.notes
            });
        }
    });

    return {
        summary,
        totalDeliveries: deliveries.length
    };
};

export const getFuelTypeDetails = async (
    fuelType: '91_GASOLINE' | '95_GASOLINE' | '98_GASOLINE' | 'DIESEL',
    dateFilter?: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string }
) => {
    let whereClause: any = undefined;

    // Date filtering
    if (dateFilter) {
        if (dateFilter.type === 'single' && dateFilter.date) {
            const startOfDay = new Date(dateFilter.date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateFilter.date);
            endOfDay.setHours(23, 59, 59, 999);

            whereClause = and(
                gte(tankerDeliveries.deliveryDate, startOfDay),
                lte(tankerDeliveries.deliveryDate, endOfDay)
            );
        } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
            const startOfRange = new Date(dateFilter.startDate);
            startOfRange.setHours(0, 0, 0, 0);
            const endOfRange = new Date(dateFilter.endDate);
            endOfRange.setHours(23, 59, 59, 999);

            whereClause = and(
                gte(tankerDeliveries.deliveryDate, startOfRange),
                lte(tankerDeliveries.deliveryDate, endOfRange)
            );
        }
    }

    // Get deliveries for specific fuel type
    const deliveries = await db.query.tankerDeliveries.findMany({
        where: whereClause,
        with: {
            tank: {
                with: {
                    station: true
                }
            },
            deliveredBy: {
                columns: {
                    id: true,
                    name: true,
                    employeeId: true
                }
            }
        },
        orderBy: (tankerDeliveries, { desc }) => [desc(tankerDeliveries.deliveryDate)]
    });

    // Filter by fuel type
    const filteredDeliveries = deliveries.filter(d => d.tank.fuelType === fuelType);

    // Group by station
    const stationMap = new Map();

    filteredDeliveries.forEach(delivery => {
        const stationId = delivery.tank.stationId;

        if (!stationMap.has(stationId)) {
            stationMap.set(stationId, {
                stationId,
                stationName: delivery.tank.station.name,
                stationAddress: delivery.tank.station.address,
                totalLiters: 0,
                deliveries: []
            });
        }

        const stationData = stationMap.get(stationId);
        stationData.totalLiters += Number(delivery.litersDelivered);
        stationData.deliveries.push({
            id: delivery.id,
            litersDelivered: delivery.litersDelivered,
            deliveryDate: delivery.deliveryDate,
            aramcoTicket: delivery.aramcoTicket,
            receiptUrl: delivery.receiptUrl,
            notes: delivery.notes,
            deliveredBy: delivery.deliveredBy?.name || 'Unknown'
        });
    });

    return {
        fuelType,
        totalLiters: filteredDeliveries.reduce((sum, d) => sum + Number(d.litersDelivered), 0),
        deliveryCount: filteredDeliveries.length,
        stations: Array.from(stationMap.values())
    };
};
