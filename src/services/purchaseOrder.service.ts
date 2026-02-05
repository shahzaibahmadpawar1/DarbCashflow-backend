import db from '../config/database';
import { purchaseOrders, purchaseRequests, tankerDeliveries, tanks, stations, creditTransactions } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { getBuyingRate } from './fuelBuyingRates.service';
import { syncStationCredits } from './creditTransactions.service';

// Generate PO number (format: PO-YYYYMMDD-XXXX)
const generatePONumber = async () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

    // Get count of POs created today
    const todayStart = new Date(today.setHours(0, 0, 0, 0));
    const todayEnd = new Date(today.setHours(23, 59, 59, 999));

    const todayPOs = await db.query.purchaseOrders.findMany({
        where: (po, { and, gte, lte }) => and(
            gte(po.createdAt, todayStart),
            lte(po.createdAt, todayEnd)
        ),
    });

    const sequence = (todayPOs.length + 1).toString().padStart(4, '0');
    return `PO-${dateStr}-${sequence}`;
};

export const createPurchaseOrder = async (
    purchaseRequestId: string,
    expectedDeliveryDate: Date,
    userId: string
) => {
    return db.transaction(async (tx) => {
        // Verify PR is approved
        const pr = await tx.query.purchaseRequests.findFirst({
            where: eq(purchaseRequests.id, purchaseRequestId),
        });

        if (!pr) {
            throw new Error('Purchase request not found');
        }

        if (pr.status !== 'APPROVED') {
            throw new Error('Purchase request must be approved before creating PO');
        }

        // MANDATORY: Extra safety check to ensure payment is verified if receipt is attached
        const hasReceipt = !!(pr.receiptUrl || pr.bankDepositReceiptUrl);
        if (hasReceipt && !pr.paymentVerified) {
            throw new Error('Payment verification required before generating PO');
        }

        // Check if PO already exists
        const existingPO = await tx.query.purchaseOrders.findFirst({
            where: eq(purchaseOrders.purchaseRequestId, purchaseRequestId),
        });

        if (existingPO) {
            throw new Error('Purchase order already exists for this request');
        }

        // Generate PO number
        const poNumber = await generatePONumber();

        // Create PO with transporter from PR
        const [po] = await tx.insert(purchaseOrders).values({
            purchaseRequestId,
            poNumber,
            expectedDeliveryDate,
            transporterId: pr.transporterId, // Copy from PR
            actualTransportationCost: pr.transportationCost, // Set default from PR
            createdBy: userId,
        }).returning();

        return po;
    });
};

export const getPurchaseOrdersByStation = async (stationId: string) => {
    // Get all POs with their purchase requests
    const allPOs = await db.query.purchaseOrders.findMany({
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
                }
            },
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
            transporter: true,
            tankerDelivery: true,
        },
        orderBy: [desc(purchaseOrders.createdAt)],
    });

    // Filter by station ID
    return allPOs.filter(po => po.purchaseRequest.stationId === stationId);
};

export const getPurchaseOrderDetails = async (poId: string) => {
    const po = await db.query.purchaseOrders.findFirst({
        where: eq(purchaseOrders.id, poId),
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
                    rejecter: {
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
                }
            },
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
            transporter: true,
            tankerDelivery: true,
        },
    });

    if (!po) {
        throw new Error('Purchase order not found');
    }

    return po;
};

// Confirm procurement (Procurement department)
export const confirmProcurement = async (
    poId: string,
    procurementDetails: {
        aramcoPoNumber: string;
        aramcoPoDate: Date;
        aramcoPoUrl?: string;
    },
    userId: string
) => {
    return db.transaction(async (tx) => {
        const po = await tx.query.purchaseOrders.findFirst({
            where: eq(purchaseOrders.id, poId),
        });

        if (!po) {
            throw new Error('Purchase order not found');
        }

        if (po.procurementConfirmedAt) {
            throw new Error('Purchase order already confirmed by procurement');
        }

        if (po.receivedAt) {
            throw new Error('Purchase order already received');
        }

        // Update PO with procurement details
        const [updatedPO] = await tx.update(purchaseOrders)
            .set({
                procurementConfirmedBy: userId,
                procurementConfirmedAt: new Date(),
                aramcoPoNumber: procurementDetails.aramcoPoNumber,
                aramcoPoDate: procurementDetails.aramcoPoDate,
                aramcoPoUrl: procurementDetails.aramcoPoUrl,
            })
            .where(eq(purchaseOrders.id, poId))
            .returning();

        return updatedPO;
    });
};


export const markPurchaseOrderReceived = async (
    poId: string,
    deliveryDetails: {
        actualDeliveryDate: Date;
        invoiceNumber: string;
        invoiceUrl?: string;
        receivedQuantityLiters: number; // Actual received quantity
        transporterId?: string; // Selected transporter
        actualTransportationCost: number; // Can be edited
    },
    userId: string
) => {
    return db.transaction(async (tx) => {
        // Get PO with full details
        const po = await tx.query.purchaseOrders.findFirst({
            where: eq(purchaseOrders.id, poId),
            with: {
                purchaseRequest: {
                    with: {
                        station: true,
                    }
                },
            },
        });

        if (!po) {
            throw new Error('Purchase order not found');
        }

        if (po.receivedAt) {
            throw new Error('Purchase order already marked as received');
        }

        const pr = po.purchaseRequest;
        const station = pr.station;

        // STEP 1: Fetch CURRENT buying rate at delivery time (not the locked PR rate)
        const currentBuyingRate = await getBuyingRate(station.id, pr.fuelType);

        if (!currentBuyingRate) {
            throw new Error(`Current buying rate not found for ${pr.fuelType} at this station`);
        }

        // STEP 2: Calculate FINAL costs using CURRENT rate at delivery
        const finalFuelCost = deliveryDetails.receivedQuantityLiters * currentBuyingRate.buyingPricePerLiter;
        const finalTotal = finalFuelCost + deliveryDetails.actualTransportationCost;

        // STEP 3: DELETE & REPLACE Strategy
        // Delete the old ESTIMATED UTILIZATION transaction (linked to PR)
        // IMPORTANT: Only delete UTILIZATION type, NOT PAYMENT (bank deposits must remain)
        const deletedTransactions = await tx.delete(creditTransactions)
            .where(
                and(
                    eq(creditTransactions.purchaseRequestId, pr.id),
                    eq(creditTransactions.type, 'UTILIZATION')
                )
            )
            .returning();

        if (deletedTransactions.length === 0) {
            throw new Error('No UTILIZATION transaction found for this PR. Cannot proceed with receipt.');
        }

        const deletedAmount = deletedTransactions[0].amount;

        // STEP 4: Insert NEW FINAL UTILIZATION transaction (linked to PO)
        await tx.insert(creditTransactions).values({
            stationId: station.id,
            type: 'UTILIZATION',
            amount: finalTotal,
            description: `FINAL fuel cost for PO ${po.poNumber} - ${deliveryDetails.receivedQuantityLiters}L of ${pr.fuelType} @ ${currentBuyingRate.buyingPricePerLiter} SAR/L + ${deliveryDetails.actualTransportationCost} SAR transport (Replaced estimated ${deletedAmount.toFixed(2)} SAR with actual ${finalTotal.toFixed(2)} SAR)`,
            createdBy: userId,
            verifiedBy: userId,
            verifiedAt: new Date(),
            purchaseOrderId: poId, // Link to PO, not PR
        });

        // STEP 5: Find the appropriate tank for this fuel type
        const tank = await tx.query.tanks.findFirst({
            where: and(
                eq(tanks.stationId, station.id),
                eq(tanks.fuelType, pr.fuelType)
            ),
        });

        if (!tank) {
            throw new Error(`No tank found for fuel type ${pr.fuelType} at this station`);
        }

        // STEP 6: Create tanker delivery record with RECEIVED quantity
        const [delivery] = await tx.insert(tankerDeliveries).values({
            tankId: tank.id,
            litersDelivered: deliveryDetails.receivedQuantityLiters,
            deliveryDate: deliveryDetails.actualDeliveryDate,
            deliveredBy: userId,
            invoiceNumber: deliveryDetails.invoiceNumber,
            purchaseOrderId: poId,
            isManual: false,
            notes: `PO ${po.poNumber}: Ordered ${pr.quantityLiters}L @ ${pr.buyingPricePerLiter} SAR/L, Received ${deliveryDetails.receivedQuantityLiters}L @ ${currentBuyingRate.buyingPricePerLiter} SAR/L`,
        }).returning();

        // STEP 7: Update tank inventory with RECEIVED quantity
        const newLevel = (tank.currentLevel || 0) + deliveryDetails.receivedQuantityLiters;
        await tx.update(tanks)
            .set({
                currentLevel: newLevel,
            })
            .where(eq(tanks.id, tank.id));

        // STEP 8: Update PO with received details
        const variance = deletedAmount - finalTotal; // Positive = saved money, Negative = cost more

        const [updatedPO] = await tx.update(purchaseOrders)
            .set({
                actualDeliveryDate: deliveryDetails.actualDeliveryDate,
                invoiceNumber: deliveryDetails.invoiceNumber,
                invoiceUrl: deliveryDetails.invoiceUrl,
                receivedQuantityLiters: deliveryDetails.receivedQuantityLiters,
                receivedAmount: finalTotal,
                transporterId: deliveryDetails.transporterId || po.transporterId,
                actualTransportationCost: deliveryDetails.actualTransportationCost,
                creditVariance: variance,
                receivedBy: userId,
                receivedAt: new Date(),
            })
            .where(eq(purchaseOrders.id, poId))
            .returning();

        // STEP 9: Update PR status to RECEIVED
        await tx.update(purchaseRequests)
            .set({ status: 'RECEIVED' })
            .where(eq(purchaseRequests.id, pr.id));

        // STEP 10: CRITICAL - Synchronize station credits after Delete & Replace
        await syncStationCredits(tx, station.id);

        return {
            purchaseOrder: updatedPO,
            delivery,
            deletedEstimate: deletedAmount,
            finalTotal,
            variance,
        };
    });
};

export const getDailyPurchaseOrders = async (date: string) => {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const pos = await db.query.purchaseOrders.findMany({
        where: (po, { and, gte, lte }) => and(
            gte(po.createdAt, startOfDay),
            lte(po.createdAt, endOfDay)
        ),
        with: {
            purchaseRequest: {
                with: {
                    station: true,
                },
            },
            transporter: true,
        },
        orderBy: (po, { desc }) => [desc(po.createdAt)],
    });

    return pos;
};
