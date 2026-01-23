import db from '../config/database';
import { creditTransactions, stations } from '../db/schema';
import { eq, sum, sql } from 'drizzle-orm';

/**
 * Synchronize station credits by summing all credit transactions
 * This replaces the unreliable database trigger approach
 * 
 * Transaction Type Math:
 * - ALLOCATION: Does NOT affect utilizedCredits (only increases totalCreditLimit)
 * - UTILIZATION: +Amount (increases debt/utilization)
 * - PAYMENT: -Amount (decreases debt/utilization, creates surplus if negative)
 * - ADJUSTMENT: Signed value (positive = charge/increase debt, negative = refund/decrease debt)
 * 
 * @param tx - Database transaction context
 * @param stationId - Station ID to synchronize
 */
export const syncStationCredits = async (tx: any, stationId: string): Promise<void> => {
    // Sum all credit transactions for this station
    // ALLOCATION transactions are excluded from utilization calculation
    const result = await tx
        .select({
            totalUtilization: sql<number>`
                COALESCE(
                    SUM(
                        CASE 
                            WHEN ${creditTransactions.type} = 'UTILIZATION' THEN ${creditTransactions.amount}
                            WHEN ${creditTransactions.type} = 'PAYMENT' THEN -${creditTransactions.amount}
                            WHEN ${creditTransactions.type} = 'ADJUSTMENT' THEN ${creditTransactions.amount}
                            ELSE 0
                        END
                    ),
                    0
                )
            `.as('totalUtilization')
        })
        .from(creditTransactions)
        .where(eq(creditTransactions.stationId, stationId));

    const utilizedCredits = result[0]?.totalUtilization || 0;

    // Update station's utilizedCredits
    await tx
        .update(stations)
        .set({
            utilizedCredits,
            purchaseCredits: sql`${stations.totalCreditLimit} - ${utilizedCredits}`, // Legacy field
            updatedAt: new Date(),
        })
        .where(eq(stations.id, stationId));
};

/**
 * Get credit transaction history for a station
 */
export const getCreditTransactionHistory = async (stationId: string) => {
    return db.query.creditTransactions.findMany({
        where: eq(creditTransactions.stationId, stationId),
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
        },
        orderBy: (ct, { desc }) => [desc(ct.createdAt)],
    });
};

/**
 * Calculate available balance for a station
 * Available Balance = Total Credit Limit - Utilized Credits
 * 
 * For credit stations: Positive balance means available credit
 * For non-credit stations: Must have negative utilization (surplus from deposits)
 */
export const getStationAvailableBalance = async (stationId: string): Promise<number> => {
    const station = await db.query.stations.findFirst({
        where: eq(stations.id, stationId),
        columns: {
            totalCreditLimit: true,
            utilizedCredits: true,
        }
    });

    if (!station) {
        throw new Error('Station not found');
    }

    return station.totalCreditLimit - station.utilizedCredits;
};
