import db from '../config/database';
import { purchaseRequests, stations, users, creditTransactions } from '../db/schema';
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
    return db.transaction(async (tx) => {
        // Get station credit status
        const station = await tx.query.stations.findFirst({
            where: eq(stations.id, data.stationId),
        });

        if (!station) {
            throw new Error('Station not found');
        }

        const availableCredits = station.totalCreditLimit - station.utilizedCredits;
        const usingCredits = station.hasCreditFacility && availableCredits >= data.paymentAmount;

        // Check receipt requirement
        if (!usingCredits && !data.receiptUrl) {
            throw new Error('Receipt is required for stations without sufficient credits');
        }

        // Create PR
        const [pr] = await tx.insert(purchaseRequests).values({
            stationId: data.stationId,
            createdBy: data.createdBy,
            fuelType: data.fuelType,
            quantityLiters: data.quantityLiters,
            paymentAmount: data.paymentAmount,
            requestedDeliveryDate: data.requestedDeliveryDate,
            receiptUrl: data.receiptUrl,
            usingCredits,
            status: 'PENDING',
        }).returning();

        // If using credits, deduct immediately and create transaction
        if (usingCredits) {
            const newUtilizedCredits = station.utilizedCredits + data.paymentAmount;
            const newAvailableCredits = station.totalCreditLimit - newUtilizedCredits;

            await tx.update(stations)
                .set({
                    utilizedCredits: newUtilizedCredits,
                    purchaseCredits: newAvailableCredits, // Update legacy field
                })
                .where(eq(stations.id, data.stationId));

            // Create credit transaction record
            await tx.insert(creditTransactions).values({
                stationId: data.stationId,
                type: 'UTILIZATION',
                amount: data.paymentAmount,
                description: `Credit reserved for PR - ${data.quantityLiters}L of ${data.fuelType}`,
                createdBy: data.createdBy,
                purchaseRequestId: pr.id,
            });
        }

        return pr;
    });
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
        availableCredits: pr.station.totalCreditLimit - pr.station.utilizedCredits,
        creditsAfterApproval: (pr.station.totalCreditLimit - pr.station.utilizedCredits) - (pr.usingCredits ? pr.paymentAmount : 0),
        hasInsufficientCredits: !pr.usingCredits && pr.station.hasCreditFacility && (pr.station.totalCreditLimit - pr.station.utilizedCredits) < pr.paymentAmount,
    };
};

export const approvePurchaseRequest = async (prId: string, userId: string, approvalComment?: string) => {
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

        // Check payment verification requirement
        if (pr.receiptUrl && !pr.usingCredits && !pr.paymentVerified) {
            throw new Error('Payment must be verified by accountant before approval');
        }

        // Note: Credits are NOT deducted here anymore - they will be deducted when PO is received

        // Update PR status
        const [updatedPr] = await tx.update(purchaseRequests)
            .set({
                status: 'APPROVED',
                approvalComment,
                reviewedBy: userId,
                reviewedAt: new Date(),
            })
            .where(eq(purchaseRequests.id, prId))
            .returning();

        return updatedPr;
    });
};

export const rejectPurchaseRequest = async (prId: string, userId: string, rejectionComment: string) => {
    return db.transaction(async (tx) => {
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

        // Update PR status
        const [updatedPr] = await tx.update(purchaseRequests)
            .set({
                status: 'REJECTED',
                rejectionComment,
                rejectionReason: rejectionComment, // Keep for backward compatibility
                reviewedBy: userId,
                reviewedAt: new Date(),
            })
            .where(eq(purchaseRequests.id, prId))
            .returning();

        // If PR was using credits, refund them
        if (pr.usingCredits) {
            const newUtilizedCredits = pr.station.utilizedCredits - pr.paymentAmount;
            const newAvailableCredits = pr.station.totalCreditLimit - newUtilizedCredits;

            await tx.update(stations)
                .set({
                    utilizedCredits: newUtilizedCredits,
                    purchaseCredits: newAvailableCredits, // Update legacy field
                })
                .where(eq(stations.id, pr.stationId));

            // Create credit transaction record for refund
            await tx.insert(creditTransactions).values({
                stationId: pr.stationId,
                type: 'ADJUSTMENT',
                amount: pr.paymentAmount,
                description: `Credit refunded - PR rejected: ${rejectionComment}`,
                createdBy: userId,
                verifiedBy: userId,
                verifiedAt: new Date(),
                purchaseRequestId: pr.id,
            });
        }

        return updatedPr;
    });
};

// Verify payment for a purchase request (Accountant only)
export const verifyPurchaseRequestPayment = async (prId: string, userId: string) => {
    const pr = await db.query.purchaseRequests.findFirst({
        where: eq(purchaseRequests.id, prId),
    });

    if (!pr) {
        throw new Error('Purchase request not found');
    }

    if (!pr.receiptUrl) {
        throw new Error('No receipt attached to this purchase request');
    }

    if (pr.paymentVerified) {
        throw new Error('Payment already verified');
    }

    const [updatedPr] = await db.update(purchaseRequests)
        .set({
            paymentVerified: true,
            paymentVerifiedBy: userId,
            paymentVerifiedAt: new Date(),
        })
        .where(eq(purchaseRequests.id, prId))
        .returning();

    return updatedPr;
};
