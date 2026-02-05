import db from '../config/database';
import { purchaseRequests, stations, users, creditTransactions, transporters } from '../db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { getAccessibleStationIds } from './officeUser.service';
import { getBuyingRate } from './fuelBuyingRates.service';
import { syncStationCredits } from './creditTransactions.service';

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

        // Get buying rate for this fuel type (current rate at time of order)
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

        // Calculate estimated total: (quantity × current buying rate) + transport
        const estimatedFuelCost = data.quantityLiters * buyingRate.buyingPricePerLiter;
        const transportationCost = defaultTransporter.defaultCost;
        const estimatedTotal = estimatedFuelCost + transportationCost;

        // STEP 1: Handle Bank Deposit FIRST (if provided)
        // IMPORTANT: Do NOT link this to purchaseRequestId - it's a standalone payment
        // This ensures it won't be deleted when we replace the UTILIZATION transaction
        if (data.bankDepositAmount && data.bankDepositAmount > 0) {
            await tx.insert(creditTransactions).values({
                stationId: data.stationId,
                type: 'PAYMENT',
                amount: data.bankDepositAmount,
                description: `Bank deposit for fuel order - ${data.quantityLiters}L of ${data.fuelType}`,
                receiptUrl: data.bankDepositReceiptUrl,
                createdBy: data.createdBy,
                verifiedBy: data.createdBy,
                verifiedAt: new Date(),
                // NOTE: No purchaseRequestId - this is a standalone payment
            });

            // Sync credits after deposit
            await syncStationCredits(tx, data.stationId);

            // Refresh station data to get updated utilizedCredits
            const updatedStation = await tx.query.stations.findFirst({
                where: eq(stations.id, data.stationId),
            });

            if (updatedStation) {
                station.utilizedCredits = updatedStation.utilizedCredits;
            }
        }

        // STEP 2: Check Available Balance (Unified Wallet Logic)
        // Available = Limit - Utilized
        // For credit stations: Limit > 0, so positive balance means credit available
        // For non-credit stations: Limit = 0, so must have negative Utilized (surplus from deposits)
        const availableBalance = station.totalCreditLimit - station.utilizedCredits;

        // Determine if using credits or cash
        const usingCredits = availableBalance >= estimatedTotal;

        // STEP 3: Validate Sufficient Funds
        if (!usingCredits && !data.receiptUrl) {
            throw new Error('Receipt is required for stations without sufficient credits');
        }

        if (!usingCredits && availableBalance < estimatedTotal) {
            throw new Error(
                `Insufficient balance. Available: ${availableBalance.toFixed(2)} SAR, Required: ${estimatedTotal.toFixed(2)} SAR. ` +
                `Please make a bank deposit of at least ${(estimatedTotal - availableBalance).toFixed(2)} SAR.`
            );
        }

        // STEP 4: Create Purchase Request
        const [pr] = await tx.insert(purchaseRequests).values({
            stationId: data.stationId,
            createdBy: data.createdBy,
            fuelType: data.fuelType,
            quantityLiters: data.quantityLiters,
            buyingPricePerLiter: buyingRate.buyingPricePerLiter,
            transporterId: defaultTransporter.id,
            transportationCost: transportationCost,
            totalAmount: estimatedTotal,
            paymentAmount: estimatedTotal, // Keep for backward compatibility
            requestedDeliveryDate: data.requestedDeliveryDate,
            receiptUrl: data.receiptUrl,
            bankDepositAmount: data.bankDepositAmount || 0,
            bankDepositReceiptUrl: data.bankDepositReceiptUrl,
            usingCredits,
            status: 'PENDING',
        }).returning();

        // STEP 5: Reserve Credits (Create UTILIZATION transaction)
        // IMPORTANT: Link this to purchaseRequestId so we can DELETE it later and REPLACE with final amount
        await tx.insert(creditTransactions).values({
            stationId: data.stationId,
            type: 'UTILIZATION',
            amount: estimatedTotal,
            description: `ESTIMATED fuel cost for PR #${pr.id.substring(0, 8)} - ${data.quantityLiters}L of ${data.fuelType} @ ${buyingRate.buyingPricePerLiter} SAR/L + ${transportationCost} SAR transport (${defaultTransporter.name}) [WILL BE REPLACED ON PO RECEIPT]`,
            createdBy: data.createdBy,
            purchaseRequestId: pr.id, // Link to PR for deletion later
        });

        // STEP 6: Synchronize Station Credits
        await syncStationCredits(tx, data.stationId);

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
            paymentVerifier: {
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
                    creator: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    receiver: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    procurementConfirmer: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
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
                paymentVerifier: {
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
                        creator: {
                            columns: {
                                id: true,
                                name: true,
                                employeeId: true,
                            }
                        },
                        receiver: {
                            columns: {
                                id: true,
                                name: true,
                                employeeId: true,
                            }
                        },
                        procurementConfirmer: {
                            columns: {
                                id: true,
                                name: true,
                                employeeId: true,
                            }
                        },
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
            paymentVerifier: {
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
                    creator: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    receiver: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
                    procurementConfirmer: {
                        columns: {
                            id: true,
                            name: true,
                            employeeId: true,
                        }
                    },
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

        // MANDATORY: Check payment verification requirement for ANY PR with receipt
        // If a receipt (main receipt or bank deposit) is attached, accountant MUST verify it before Office User can approve
        const hasReceipt = !!(pr.receiptUrl || pr.bankDepositReceiptUrl);
        if (hasReceipt && !pr.paymentVerified) {
            throw new Error(
                'Payment verification required: This purchase request has an attached receipt (or bank deposit). ' +
                'An accountant must verify the payment before it can be approved.'
            );
        }

        // Note: Credits are NOT deducted here anymore - they will be deducted when PO is received

        // Update PR status
        const [updatedPr] = await tx.update(purchaseRequests)
            .set({
                status: 'APPROVED',
                approvalComment,
                approvedBy: userId,
                approvedAt: new Date(),
                reviewedBy: userId, // Keep for backward compatibility
                reviewedAt: new Date(), // Keep for backward compatibility
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
                rejectedBy: userId,
                rejectedAt: new Date(),
                reviewedBy: userId, // Keep for backward compatibility
                reviewedAt: new Date(), // Keep for backward compatibility
            })
            .where(eq(purchaseRequests.id, prId))
            .returning();

        // If PR had reserved credits (UTILIZATION transaction), create refund
        // This releases the reserved credits back to the station
        if (pr.usingCredits || pr.totalAmount > 0) {
            // Create NEGATIVE ADJUSTMENT to refund the reserved amount
            await tx.insert(creditTransactions).values({
                stationId: pr.stationId,
                type: 'ADJUSTMENT',
                amount: -pr.totalAmount, // NEGATIVE to reduce utilization (refund)
                description: `Credit refund - PR #${pr.id.substring(0, 8)} rejected: ${rejectionComment}`,
                createdBy: userId,
                verifiedBy: userId,
                verifiedAt: new Date(),
                purchaseRequestId: pr.id,
            });

            // Synchronize station credits
            await syncStationCredits(tx, pr.stationId);
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

    if (!pr.receiptUrl && !pr.bankDepositReceiptUrl) {
        throw new Error('No receipt or bank deposit attached to this purchase request');
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
