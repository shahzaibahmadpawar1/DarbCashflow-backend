import db from '../config/database';
import { purchaseOrders, purchaseRequests, tankerDeliveries, tanks, stations, creditTransactions } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

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

        // Check if PO already exists
        const existingPO = await tx.query.purchaseOrders.findFirst({
            where: eq(purchaseOrders.purchaseRequestId, purchaseRequestId),
        });

        if (existingPO) {
            throw new Error('Purchase order already exists for this request');
        }

        // Generate PO number
        const poNumber = await generatePONumber();

        // Create PO
        const [po] = await tx.insert(purchaseOrders).values({
            purchaseRequestId,
            poNumber,
            expectedDeliveryDate,
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
            tankerDelivery: true,
        },
    });

    if (!po) {
        throw new Error('Purchase order not found');
    }

    return po;
};

export const markPurchaseOrderReceived = async (
    poId: string,
    deliveryDetails: {
        actualDeliveryDate: Date;
        invoiceNumber: string;
        invoiceUrl?: string;
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

        // Find the appropriate tank for this fuel type
        const tank = await tx.query.tanks.findFirst({
            where: and(
                eq(tanks.stationId, station.id),
                eq(tanks.fuelType, pr.fuelType)
            ),
        });

        if (!tank) {
            throw new Error(`No tank found for fuel type ${pr.fuelType} at this station`);
        }

        // Create tanker delivery record
        const [delivery] = await tx.insert(tankerDeliveries).values({
            tankId: tank.id,
            litersDelivered: pr.quantityLiters,
            deliveryDate: deliveryDetails.actualDeliveryDate,
            deliveredBy: userId,
            invoiceNumber: deliveryDetails.invoiceNumber,
            purchaseOrderId: poId,
            isManual: false, // This is PO-based, not manual
            notes: `Auto-created from PO ${po.poNumber}`,
        }).returning();

        // Update tank inventory
        const newLevel = (tank.currentLevel || 0) + pr.quantityLiters;
        await tx.update(tanks)
            .set({
                currentLevel: newLevel,
            })
            .where(eq(tanks.id, tank.id));

        // Note: Credits were already deducted when PR was created
        // No need to deduct again here

        // Update PO
        const [updatedPO] = await tx.update(purchaseOrders)
            .set({
                actualDeliveryDate: deliveryDetails.actualDeliveryDate,
                invoiceNumber: deliveryDetails.invoiceNumber,
                invoiceUrl: deliveryDetails.invoiceUrl,
                receivedBy: userId,
                receivedAt: new Date(),
            })
            .where(eq(purchaseOrders.id, poId))
            .returning();

        // Update PR status to RECEIVED
        await tx.update(purchaseRequests)
            .set({
                status: 'RECEIVED',
            })
            .where(eq(purchaseRequests.id, po.purchaseRequestId));

        return {
            purchaseOrder: updatedPO,
            tankerDelivery: delivery,
            tankUpdated: {
                tankId: tank.id,
                previousLevel: tank.currentLevel,
                newLevel,
                litersAdded: pr.quantityLiters,
            },
            creditsDeducted: pr.usingCredits ? pr.paymentAmount : 0,
        };
    });
};
