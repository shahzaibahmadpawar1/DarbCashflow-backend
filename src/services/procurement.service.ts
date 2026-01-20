import db from '../config/database';
import { purchaseOrders, purchaseRequests } from '../db/schema';
import { eq, and, isNull, isNotNull } from 'drizzle-orm';

// Get purchase orders pending procurement confirmation for a specific station
export const getPendingProcurementPOs = async (stationId: string) => {
    // First get all purchase requests for this station
    const prs = await db.query.purchaseRequests.findMany({
        where: eq(purchaseRequests.stationId, stationId),
    });

    const prIds = prs.map(pr => pr.id);

    // Then get POs for those PRs that are pending procurement confirmation
    const pos = await db.query.purchaseOrders.findMany({
        where: and(
            isNull(purchaseOrders.procurementConfirmedAt),
            isNull(purchaseOrders.receivedAt)
        ),
        with: {
            purchaseRequest: {
                with: {
                    station: true,
                },
            },
        },
        orderBy: (purchaseOrders, { desc }) => [desc(purchaseOrders.createdAt)],
    });

    // Filter to only include POs for this station
    return pos.filter(po => prIds.includes(po.purchaseRequestId));
};

// Get all purchase orders for procurement user (for their assigned stations)
export const getProcurementPOs = async (stationId: string) => {
    // First get all purchase requests for this station
    const prs = await db.query.purchaseRequests.findMany({
        where: eq(purchaseRequests.stationId, stationId),
    });

    const prIds = prs.map(pr => pr.id);

    // Then get all POs for those PRs
    const pos = await db.query.purchaseOrders.findMany({
        with: {
            purchaseRequest: {
                with: {
                    station: true,
                },
            },
        },
        orderBy: (purchaseOrders, { desc }) => [desc(purchaseOrders.createdAt)],
    });

    // Filter to only include POs for this station
    return pos.filter(po => prIds.includes(po.purchaseRequestId));
};

// Get confirmed POs (ready for station manager to receive)
export const getConfirmedPOs = async (stationId: string) => {
    // First get all purchase requests for this station
    const prs = await db.query.purchaseRequests.findMany({
        where: eq(purchaseRequests.stationId, stationId),
    });

    const prIds = prs.map(pr => pr.id);

    // Then get confirmed POs
    const pos = await db.query.purchaseOrders.findMany({
        where: and(
            isNotNull(purchaseOrders.procurementConfirmedAt),
            isNull(purchaseOrders.receivedAt)
        ),
        with: {
            purchaseRequest: {
                with: {
                    station: true,
                },
            },
        },
        orderBy: (purchaseOrders, { desc }) => [desc(purchaseOrders.procurementConfirmedAt)],
    });

    // Filter to only include POs for this station
    return pos.filter(po => prIds.includes(po.purchaseRequestId));
};
