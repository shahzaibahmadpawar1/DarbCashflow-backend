import db from '../config/database';
import { purchaseRequests, stations, users } from '../db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { getAccessibleStationIds } from './officeUser.service';

export const createPurchaseRequest = async (data: {
    stationId: string;
    createdBy: string;
    fuelType: '91_GASOLINE' | '95_GASOLINE' | 'DIESEL';
    quantityLiters: number;
    paymentAmount: number;
    requestedDeliveryDate: Date;
    receiptUrl?: string;
}) => {
    const [pr] = await db.insert(purchaseRequests).values({
        stationId: data.stationId,
        createdBy: data.createdBy,
        fuelType: data.fuelType,
        quantityLiters: data.quantityLiters,
        paymentAmount: data.paymentAmount,
        requestedDeliveryDate: data.requestedDeliveryDate,
        receiptUrl: data.receiptUrl,
        status: 'PENDING',
    }).returning();

    return pr;
};

export const getPurchaseRequestsByStation = async (stationId: string) => {
    return db.query.purchaseRequests.findMany({
        where: eq(purchaseRequests.stationId, stationId),
        with: {
            station: true,
            creator: {
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
            purchaseOrder: true,
        },
        orderBy: [desc(purchaseRequests.createdAt)],
    });
};

export const getPurchaseRequestsForOfficeUser = async (userId: string) => {
    // Get accessible station IDs for this office user
    const accessibleStationIds = await getAccessibleStationIds(userId);

    if (accessibleStationIds === 'all') {
        // Return all purchase requests
        return db.query.purchaseRequests.findMany({
            with: {
                station: true,
                creator: {
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
                purchaseOrder: true,
            },
            orderBy: [desc(purchaseRequests.createdAt)],
        });
    }

    if (accessibleStationIds.length === 0) {
        return [];
    }

    return db.query.purchaseRequests.findMany({
        where: inArray(purchaseRequests.stationId, accessibleStationIds),
        with: {
            station: true,
            creator: {
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
            purchaseOrder: true,
        },
        orderBy: [desc(purchaseRequests.createdAt)],
    });
};

export const getPurchaseRequestDetails = async (prId: string) => {
    const pr = await db.query.purchaseRequests.findFirst({
        where: eq(purchaseRequests.id, prId),
        with: {
            station: true,
            creator: {
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
            purchaseOrder: true,
        },
    });

    if (!pr) {
        throw new Error('Purchase request not found');
    }

    return {
        ...pr,
        creditsAfterApproval: pr.station.purchaseCredits - pr.paymentAmount,
        hasInsufficientCredits: pr.station.purchaseCredits < pr.paymentAmount,
    };
};

export const approvePurchaseRequest = async (prId: string, userId: string) => {
    return db.transaction(async (tx) => {
        // Get PR details
        const pr = await tx.query.purchaseRequests.findFirst({
            where: eq(purchaseRequests.id, prId),
            with: {
                station: true,
            },
        });

        if (!pr) {
            throw new Error('Purchase request not found');
        }

        if (pr.status !== 'PENDING') {
            throw new Error('Purchase request is not pending');
        }

        // Deduct credits from station
        await tx.update(stations)
            .set({
                purchaseCredits: pr.station.purchaseCredits - pr.paymentAmount,
            })
            .where(eq(stations.id, pr.stationId));

        // Update PR status
        const [updatedPr] = await tx.update(purchaseRequests)
            .set({
                status: 'APPROVED',
                reviewedBy: userId,
                reviewedAt: new Date(),
            })
            .where(eq(purchaseRequests.id, prId))
            .returning();

        return updatedPr;
    });
};

export const rejectPurchaseRequest = async (prId: string, userId: string, reason: string) => {
    const pr = await db.query.purchaseRequests.findFirst({
        where: eq(purchaseRequests.id, prId),
    });

    if (!pr) {
        throw new Error('Purchase request not found');
    }

    if (pr.status !== 'PENDING') {
        throw new Error('Purchase request is not pending');
    }

    const [updatedPr] = await db.update(purchaseRequests)
        .set({
            status: 'REJECTED',
            rejectionReason: reason,
            reviewedBy: userId,
            reviewedAt: new Date(),
        })
        .where(eq(purchaseRequests.id, prId))
        .returning();

    return updatedPr;
};
