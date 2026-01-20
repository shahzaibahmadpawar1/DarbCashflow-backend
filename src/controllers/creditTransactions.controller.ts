import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import db from '../config/database';
import { creditTransactions, stations, users } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

// Get credit transactions for a station
export const getCreditTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId } = req.params;
        const { limit = '50', offset = '0' } = req.query;

        const transactions = await db.query.creditTransactions.findMany({
            where: eq(creditTransactions.stationId, stationId),
            orderBy: desc(creditTransactions.createdAt),
            limit: parseInt(limit as string),
            offset: parseInt(offset as string),
            with: {
                creator: {
                    columns: {
                        id: true,
                        name: true,
                        employeeId: true,
                    }
                },
                verifier: {
                    columns: {
                        id: true,
                        name: true,
                        employeeId: true,
                    }
                },
                purchaseRequest: true,
                purchaseOrder: true,
            }
        });

        res.json({ transactions });
    } catch (error: any) {
        console.error('Error fetching credit transactions:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get credit summary for a station
export const getCreditSummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId } = req.params;

        const station = await db.query.stations.findFirst({
            where: eq(stations.id, stationId),
            columns: {
                id: true,
                name: true,
                totalCreditLimit: true,
                utilizedCredits: true,
                hasCreditFacility: true,
            }
        });

        if (!station) {
            res.status(404).json({ error: 'Station not found' });
            return;
        }

        const availableCredits = station.totalCreditLimit - station.utilizedCredits;

        // Fetch recent transactions for this station
        const transactions = await db.query.creditTransactions.findMany({
            where: eq(creditTransactions.stationId, stationId),
            orderBy: desc(creditTransactions.createdAt),
            limit: 50, // Get last 50 transactions
            with: {
                creator: {
                    columns: {
                        id: true,
                        name: true,
                        employeeId: true,
                    }
                },
                verifier: {
                    columns: {
                        id: true,
                        name: true,
                        employeeId: true,
                    }
                },
                purchaseRequest: true,
                purchaseOrder: true,
            }
        });

        res.json({
            station: {
                id: station.id,
                name: station.name,
                hasCreditFacility: station.hasCreditFacility,
                totalCreditLimit: station.totalCreditLimit,
                utilizedCredits: station.utilizedCredits,
                availableCredits: Math.max(0, availableCredits),
            },
            transactions: transactions || [], // Include transactions in the response
        });
    } catch (error: any) {
        console.error('Error fetching credit summary:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Submit a payment (creates pending credit transaction)
export const submitPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId, amount, description, receiptUrl } = req.body;

        if (!stationId || !amount || amount <= 0) {
            res.status(400).json({ error: 'Station ID and valid amount are required' });
            return;
        }

        if (!receiptUrl) {
            res.status(400).json({ error: 'Receipt is required for payments' });
            return;
        }

        // Create pending payment transaction
        const [transaction] = await db.insert(creditTransactions).values({
            stationId,
            type: 'PAYMENT',
            amount,
            description: description || 'Payment submitted',
            receiptUrl,
            createdBy: req.user!.id,
        }).returning();

        res.status(201).json({
            message: 'Payment submitted successfully. Awaiting accountant verification.',
            transaction
        });
    } catch (error: any) {
        console.error('Error submitting payment:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Verify payment (Accountant only)
export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        // Check if user is accountant or admin
        if (req.user?.role !== 'Accountant' && req.user?.role !== 'Admin') {
            res.status(403).json({ error: 'Only accountants can verify payments' });
            return;
        }

        const transaction = await db.query.creditTransactions.findFirst({
            where: and(
                eq(creditTransactions.id, id),
                eq(creditTransactions.type, 'PAYMENT')
            ),
            with: {
                station: true,
            }
        });

        if (!transaction) {
            res.status(404).json({ error: 'Payment transaction not found' });
            return;
        }

        if (transaction.verifiedAt) {
            res.status(400).json({ error: 'Payment already verified' });
            return;
        }

        // Update transaction and station credits in a transaction
        await db.transaction(async (tx) => {
            // Mark payment as verified
            await tx.update(creditTransactions)
                .set({
                    verifiedBy: req.user!.id,
                    verifiedAt: new Date(),
                })
                .where(eq(creditTransactions.id, id));

            // Update station credits - decrease utilized credits
            const newUtilizedCredits = Math.max(0, transaction.station.utilizedCredits - transaction.amount);

            await tx.update(stations)
                .set({
                    utilizedCredits: newUtilizedCredits,
                    purchaseCredits: transaction.station.totalCreditLimit - newUtilizedCredits, // Update legacy field
                })
                .where(eq(stations.id, transaction.stationId));
        });

        res.json({ message: 'Payment verified successfully' });
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get pending payment verifications (Accountant dashboard)
export const getPendingPayments = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        // Check if user is accountant or admin
        if (req.user?.role !== 'Accountant' && req.user?.role !== 'Admin') {
            res.status(403).json({ error: 'Only accountants can access this endpoint' });
            return;
        }

        const pendingPayments = await db.query.creditTransactions.findMany({
            where: and(
                eq(creditTransactions.type, 'PAYMENT'),
                eq(creditTransactions.verifiedAt, null as any)
            ),
            orderBy: desc(creditTransactions.createdAt),
            with: {
                station: {
                    columns: {
                        id: true,
                        name: true,
                    }
                },
                creator: {
                    columns: {
                        id: true,
                        name: true,
                        employeeId: true,
                    }
                }
            }
        });

        res.json({ pendingPayments });
    } catch (error: any) {
        console.error('Error fetching pending payments:', error);
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
