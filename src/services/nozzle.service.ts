import db from '../config/database';
import { nozzles } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export const updateNozzleOrder = async (stationId: string, nozzleOrders: { id: string; displayOrder: number }[]) => {
    // Update each nozzle's display order
    for (const { id, displayOrder } of nozzleOrders) {
        await db.update(nozzles)
            .set({ displayOrder, updatedAt: new Date() })
            .where(and(
                eq(nozzles.id, id),
                eq(nozzles.stationId, stationId)
            ));
    }

    // Return updated nozzles for this station
    return db.query.nozzles.findMany({
        where: eq(nozzles.stationId, stationId),
        orderBy: (nozzles, { asc }) => [asc(nozzles.displayOrder)]
    });
};

export const getNozzlesByStation = async (stationId: string) => {
    return db.query.nozzles.findMany({
        where: eq(nozzles.stationId, stationId),
        orderBy: (nozzles, { asc }) => [asc(nozzles.displayOrder), asc(nozzles.createdAt)]
    });
};
