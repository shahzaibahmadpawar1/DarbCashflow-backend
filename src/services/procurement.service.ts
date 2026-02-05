import db from '../config/database';
import { purchaseOrders, purchaseRequests } from '../db/schema';
import { eq, and, isNull, isNotNull, inArray } from 'drizzle-orm';

// Get purchase orders pending procurement confirmation for multiple stations
export const getPendingProcurementPOs = async (stationIds: string[]) => {
    // First get all purchase requests for these stations
    const prs = await db.query.purchaseRequests.findMany({
        where: inArray(purchaseRequests.stationId, stationIds),
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
                    creator: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    paymentVerifier: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    approver: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    reviewer: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                },
            },
            transporter: true,
        },
        orderBy: (purchaseOrders, { desc }) => [desc(purchaseOrders.createdAt)],
    });

    // Filter to only include POs for this station
    return pos.filter(po => prIds.includes(po.purchaseRequestId));
};

// Get all purchase orders for procurement user (for their assigned stations)
export const getProcurementPOs = async (stationIds: string[]) => {
    // First get all purchase requests for these stations
    const prs = await db.query.purchaseRequests.findMany({
        where: inArray(purchaseRequests.stationId, stationIds),
    });

    const prIds = prs.map(pr => pr.id);

    // Then get all POs for those PRs
    const pos = await db.query.purchaseOrders.findMany({
        with: {
            purchaseRequest: {
                with: {
                    station: true,
                    creator: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    paymentVerifier: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    approver: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    reviewer: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                },
            },
            transporter: true,
        },
        orderBy: (purchaseOrders, { desc }) => [desc(purchaseOrders.createdAt)],
    });

    // Filter to only include POs for this station
    return pos.filter(po => prIds.includes(po.purchaseRequestId));
};

// Get confirmed POs (ready for station manager to receive)
export const getConfirmedPOs = async (stationIds: string[]) => {
    // First get all purchase requests for these stations
    const prs = await db.query.purchaseRequests.findMany({
        where: inArray(purchaseRequests.stationId, stationIds),
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
                    creator: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    paymentVerifier: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    approver: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    reviewer: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                },
            },
            transporter: true,
        },
        orderBy: (purchaseOrders, { desc }) => [desc(purchaseOrders.procurementConfirmedAt)],
    });

    // Filter to only include POs for this station
    return pos.filter(po => prIds.includes(po.purchaseRequestId));
};
