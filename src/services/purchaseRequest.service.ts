import db from '../config/database';
import { purchaseRequests, stations, users, creditTransactions, transporters } from '../db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { getAccessibleStationIds } from './officeUser.service';
import { getBuyingRate } from './fuelBuyingRates.service';

export const createPurchaseRequest = async (data: {
    stationId: string;
    createdBy: string;
    fuelType: '91_GASOLINE' | '95_GASOLINE' | '98_GASOLINE' | 'DIESEL';
    quantityLiters: number;
    requestedDeliveryDate: Date;
    receiptUrl?: string;
    bankDepositAmount?: number;
    bankDepositReceiptUrl?: string;
}) => {
    return db.transaction(async (tx) => {
        // Get station details
        const station = await tx.query.stations.findFirst({
            where: eq(stations.id, data.stationId),
        });

        if (!station) {
            throw new Error('Station not found');
        }

        // Get buying rate for this fuel type
        const buyingRate = await getBuyingRate(data.stationId, data.fuelType);

        if (!buyingRate) {
            throw new Error(`Buying rate not set for ${data.fuelType} at this station. Please contact admin.`);
        }

        // Get default transporter "Bin Salman"
        const defaultTransporter = await tx.query.transporters.findFirst({
            where: eq(transporters.name, 'Bin Salman'),
        });

        if (!defaultTransporter) {
            throw new Error('Default transporter "Bin Salman" not found. Please contact admin.');
        }

        // Calculate total amount: (quantity × buying rate) + transporter's default cost
        const fuelCost = data.quantityLiters * buyingRate.buyingPricePerLiter;
        const transportationCost = defaultTransporter.defaultCost;
        const totalAmount = fuelCost + transportationCost;

        const availableCredits = station.totalCreditLimit - station.utilizedCredits;
        const usingCredits = station.hasCreditFacility && availableCredits >= totalAmount;

        // Check receipt requirement
        if (!usingCredits && !data.receiptUrl) {
            throw new Error('Receipt is required for stations without sufficient credits');
        }

        // Create PR with calculated values and default transporter
        const [pr] = await tx.insert(purchaseRequests).values({
            stationId: data.stationId,
            createdBy: data.createdBy,
            fuelType: data.fuelType,
            quantityLiters: data.quantityLiters,
            buyingPricePerLiter: buyingRate.buyingPricePerLiter,
            transporterId: defaultTransporter.id,
            transportationCost: transportationCost,
            totalAmount: totalAmount,
            paymentAmount: totalAmount, // Keep for backward compatibility
            requestedDeliveryDate: data.requestedDeliveryDate,
            receiptUrl: data.receiptUrl,
            bankDepositAmount: data.bankDepositAmount || 0,
            bankDepositReceiptUrl: data.bankDepositReceiptUrl,
            usingCredits,
            status: 'PENDING',
        }).returning();

        // Calculate the final utilized credits after both operations
        let finalUtilizedCredits = station.utilizedCredits;

        // If using credits, add the PR amount to utilized credits
        if (usingCredits) {
            finalUtilizedCredits += totalAmount;

            // Create credit transaction record for utilization
            await tx.insert(creditTransactions).values({
                stationId: data.stationId,
                type: 'UTILIZATION',
                amount: totalAmount,
                description: `Credit reserved for PR - ${data.quantityLiters}L of ${data.fuelType} @ ${buyingRate.buyingPricePerLiter} SAR/L + ${transportationCost} SAR transport (${defaultTransporter.name})`,
                createdBy: data.createdBy,
                purchaseRequestId: pr.id,
            });
        }

        // If bank deposit is made, reduce utilized credits from the new total
        if (data.bankDepositAmount && data.bankDepositAmount > 0) {
            finalUtilizedCredits = Math.max(0, finalUtilizedCredits - data.bankDepositAmount);

            // Create credit transaction record for deposit
            await tx.insert(creditTransactions).values({
                stationId: data.stationId,
                type: 'PAYMENT',
                amount: data.bankDepositAmount,
                description: `Bank deposit with PR - ${data.quantityLiters}L of ${data.fuelType}`,
                receiptUrl: data.bankDepositReceiptUrl,
                createdBy: data.createdBy,
                verifiedBy: data.createdBy,
                verifiedAt: new Date(),
                purchaseRequestId: pr.id,
            });
        }

        // Note: Station credits are now automatically synchronized by database trigger
        // The trigger recalculates utilized_credits from credit_transactions table
        // No manual update needed here

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
            transporter: true,
            purchaseOrder: {
                with: {
                    transporter: true,
                }
            },
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
                transporter: true,
                purchaseOrder: {
                    with: {
                        transporter: true,
                    }
                },
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
            transporter: true,
            purchaseOrder: {
                with: {
                    transporter: true,
                }
            },
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
            transporter: true,
            purchaseOrder: {
                with: {
                    transporter: true,
                }
            },
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

        // If PR was using credits, create refund transaction
        // Note: Station credits will be automatically updated by database trigger
        if (pr.usingCredits) {
            // Create credit transaction record for refund
            await tx.insert(creditTransactions).values({
                stationId: pr.stationId,
                type: 'ADJUSTMENT',
                amount: -pr.paymentAmount, // Negative to reduce utilized credits
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
