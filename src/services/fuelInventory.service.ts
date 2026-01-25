import db from '../config/database';
import { tankerDeliveries, tanks, stations, purchaseOrders } from '../db/schema';
import { eq, and, gte, lte, sql, inArray, desc } from 'drizzle-orm';
import { getAccessibleStationIds } from './officeUser.service';

export const getFuelTankInventorySummary = async (
    dateFilter?: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string },
    user?: any
) => {
    let conditions = [];

    // Station filtering for non-admin users
    if (user && user.role !== 'Admin') {
        const accessibleStationIds = await getAccessibleStationIds(user.id);
        if (accessibleStationIds !== 'all') {
            if (Array.isArray(accessibleStationIds) && accessibleStationIds.length > 0) {
                conditions.push(inArray(tanks.stationId, accessibleStationIds));
            } else {
                // No stations assigned, return empty summary
                return {
                    summary: {
                        '91_GASOLINE': { totalLiters: 0, deliveryCount: 0, stations: [] },
                        '95_GASOLINE': { totalLiters: 0, deliveryCount: 0, stations: [] },
                        '98_GASOLINE': { totalLiters: 0, deliveryCount: 0, stations: [] },
                        'DIESEL': { totalLiters: 0, deliveryCount: 0, stations: [] }
                    },
                    totalDeliveries: 0
                };
            }
        }
    }

    // Date filtering
    if (dateFilter) {
        if (dateFilter.type === 'single' && dateFilter.date) {
            const startOfDay = new Date(dateFilter.date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateFilter.date);
            endOfDay.setHours(23, 59, 59, 999);

            conditions.push(gte(tankerDeliveries.deliveryDate, startOfDay));
            conditions.push(lte(tankerDeliveries.deliveryDate, endOfDate(endOfDay)));
        } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
            const startOfRange = new Date(dateFilter.startDate);
            startOfRange.setHours(0, 0, 0, 0);
            const endOfRange = new Date(dateFilter.endDate);
            endOfRange.setHours(23, 59, 59, 999);

            conditions.push(gte(tankerDeliveries.deliveryDate, startOfRange));
            conditions.push(lte(tankerDeliveries.deliveryDate, endOfDate(endOfRange)));
        }
    }

    // Helper to set end of date correctly
    function endOfDate(date: Date) {
        date.setHours(23, 59, 59, 999);
        return date;
    }

    // Get all deliveries with join to tanks, stations, and purchase orders
    const query = db.select({
        id: tankerDeliveries.id,
        tankId: tankerDeliveries.tankId,
        litersDelivered: tankerDeliveries.litersDelivered,
        deliveryDate: tankerDeliveries.deliveryDate,
        aramcoTicket: sql<string>`COALESCE(${purchaseOrders.invoiceNumber}, ${tankerDeliveries.aramcoTicket})`.as('aramco_ticket'), // Prefer PO invoice number
        invoiceNumber: purchaseOrders.invoiceNumber,
        receiptUrl: tankerDeliveries.receiptUrl,
        notes: tankerDeliveries.notes,
        stationId: tanks.stationId,
        fuelType: tanks.fuelType,
        stationName: stations.name
    })
        .from(tankerDeliveries)
        .innerJoin(tanks, eq(tankerDeliveries.tankId, tanks.id))
        .innerJoin(stations, eq(tanks.stationId, stations.id))
        .leftJoin(purchaseOrders, eq(tankerDeliveries.purchaseOrderId, purchaseOrders.id))
        .orderBy(desc(tankerDeliveries.deliveryDate));

    if (conditions.length > 0) {
        query.where(and(...conditions));
    }

    const deliveries = await query;

    // Group by fuel type
    const summary: Record<string, any> = {
        '91_GASOLINE': { totalLiters: 0, deliveryCount: 0, stations: [] as any[] },
        '95_GASOLINE': { totalLiters: 0, deliveryCount: 0, stations: [] as any[] },
        '98_GASOLINE': { totalLiters: 0, deliveryCount: 0, stations: [] as any[] },
        'DIESEL': { totalLiters: 0, deliveryCount: 0, stations: [] as any[] }
    };

    // Process deliveries
    deliveries.forEach(delivery => {
        const fuelType = delivery.fuelType;

        if (summary[fuelType]) {
            summary[fuelType].totalLiters += Number(delivery.litersDelivered);
            summary[fuelType].deliveryCount += 1;

            // Add to stations list
            summary[fuelType].stations.push({
                deliveryId: delivery.id,
                stationId: delivery.stationId,
                stationName: delivery.stationName,
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
    dateFilter?: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string },
    user?: any
) => {
    let conditions = [];
    conditions.push(eq(tanks.fuelType, fuelType));

    // Station filtering for non-admin users
    if (user && user.role !== 'Admin') {
        const accessibleStationIds = await getAccessibleStationIds(user.id);
        if (accessibleStationIds !== 'all') {
            if (Array.isArray(accessibleStationIds) && accessibleStationIds.length > 0) {
                conditions.push(inArray(tanks.stationId, accessibleStationIds));
            } else {
                // No stations assigned, return empty results
                return {
                    fuelType,
                    totalLiters: 0,
                    deliveryCount: 0,
                    stations: []
                };
            }
        }
    }

    // Date filtering
    if (dateFilter) {
        if (dateFilter.type === 'single' && dateFilter.date) {
            const startOfDay = new Date(dateFilter.date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(dateFilter.date);
            endOfDay.setHours(23, 59, 59, 999);

            conditions.push(gte(tankerDeliveries.deliveryDate, startOfDay));
            conditions.push(lte(tankerDeliveries.deliveryDate, endOfDay));
        } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
            const startOfRange = new Date(dateFilter.startDate);
            startOfRange.setHours(0, 0, 0, 0);
            const endOfRange = new Date(dateFilter.endDate);
            endOfRange.setHours(23, 59, 59, 999);

            conditions.push(gte(tankerDeliveries.deliveryDate, startOfRange));
            conditions.push(lte(tankerDeliveries.deliveryDate, endOfRange));
        }
    }

    // Get deliveries for specific fuel type with joins
    // We also want to include the user who delivered it if possible
    // Note: tankerDeliveries.deliveredBy references users table
    const query = db.select({
        id: tankerDeliveries.id,
        litersDelivered: tankerDeliveries.litersDelivered,
        deliveryDate: tankerDeliveries.deliveryDate,
        aramcoTicket: sql<string>`COALESCE(${purchaseOrders.invoiceNumber}, ${tankerDeliveries.aramcoTicket})`.as('aramco_ticket'), // Prefer PO invoice number
        invoiceNumber: purchaseOrders.invoiceNumber,
        receiptUrl: tankerDeliveries.receiptUrl,
        notes: tankerDeliveries.notes,
        stationId: tanks.stationId,
        stationName: stations.name,
        stationAddress: stations.address
    })
        .from(tankerDeliveries)
        .innerJoin(tanks, eq(tankerDeliveries.tankId, tanks.id))
        .innerJoin(stations, eq(tanks.stationId, stations.id))
        .leftJoin(purchaseOrders, eq(tankerDeliveries.purchaseOrderId, purchaseOrders.id))
        .where(and(...conditions))
        .orderBy(desc(tankerDeliveries.deliveryDate));

    const deliveries = await query;

    // Group by station
    const stationMap = new Map();

    deliveries.forEach(delivery => {
        const stationId = delivery.stationId;

        if (!stationMap.has(stationId)) {
            stationMap.set(stationId, {
                stationId,
                stationName: delivery.stationName,
                stationAddress: delivery.stationAddress,
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
            deliveredBy: 'Recorded' // In this query we didn't join users for speed, can add if needed
        });
    });

    return {
        fuelType,
        totalLiters: deliveries.reduce((sum, d) => sum + Number(d.litersDelivered), 0),
        deliveryCount: deliveries.length,
        stations: Array.from(stationMap.values())
    };
};
