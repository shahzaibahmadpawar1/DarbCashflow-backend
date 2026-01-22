import db from '../config/database';
import { cashTransactions, cashTransfers, shifts, users, stations, bankDeposits, bankDepositItems } from '../db/schema';
import { eq, and, inArray, desc, sql, gte, lte } from 'drizzle-orm';
import { getAccessibleStationIds } from './officeUser.service';

// Helper function to determine current shift type based on time
const getCurrentShiftType = (): 'DAY' | 'NIGHT' => {
  const hour = new Date().getHours();
  // DAY shift: 6 AM to 6 PM, NIGHT shift: 6 PM to 6 AM
  return (hour >= 6 && hour < 18) ? 'DAY' : 'NIGHT';
};

export const createCashTransaction = async (data: {
  stationId: string;
  litersSold: number;
  ratePerLiter: number;
  cardPayments: number;
  bankDeposit: number;
  userId: string;
}) => {
  // 1. Find or create current open shift for the station
  let shift = await db.query.shifts.findFirst({
    where: and(
      eq(shifts.stationId, data.stationId),
      eq(shifts.status, 'OPEN')
    )
  });

  if (!shift) {
    // Create new shift
    const [newShift] = await db.insert(shifts).values({
      stationId: data.stationId,
      shiftType: getCurrentShiftType(),
      startTime: new Date(),
      status: 'OPEN',
      locked: false,
    }).returning();
    shift = newShift;
  }

  // 2. Create transaction
  const totalRevenue = data.litersSold * data.ratePerLiter;
  const cashOnHand = totalRevenue - data.cardPayments;
  const cashToAM = cashOnHand - data.bankDeposit;

  const [transaction] = await db.insert(cashTransactions).values({
    shiftId: shift.id,
    stationId: data.stationId,
    litersSold: data.litersSold,
    ratePerLiter: data.ratePerLiter,
    totalRevenue,
    cardPayments: data.cardPayments,
    cashOnHand,
    bankDeposit: data.bankDeposit,
    cashToAM,
    status: 'PENDING_ACCEPTANCE',
  }).returning();

  // Fetch transaction with relations
  return db.query.cashTransactions.findFirst({
    where: eq(cashTransactions.id, transaction.id),
    with: {
      station: true,
      shift: true,
      cashTransfer: {
        with: {
          fromUser: { columns: { id: true, name: true, employeeId: true } },
          toUser: { columns: { id: true, name: true, employeeId: true } },
        },
      },
    },
  });
};


export const getCashTransactions = async (
  userId: string,
  userRole: string,
  stationId?: string | null,
  dateFilter?: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string }
) => {
  const whereClauses: any[] = [];

  // Role-based filtering
  if (userRole === 'SM' && stationId) {
    whereClauses.push(eq(cashTransactions.stationId, stationId));
  } else if (userRole === 'AM') {
    // AM can see transactions from stations managed by their subordinate Station Managers
    const subordinateSMs = await db.query.users.findMany({
      where: eq(users.areaManagerId, userId),
      columns: { stationId: true }
    });

    const stationIds = subordinateSMs
      .map(sm => sm.stationId)
      .filter((id): id is string => id !== null && id !== undefined);

    if (stationIds.length > 0) {
      whereClauses.push(inArray(cashTransactions.stationId, stationIds));
    } else {
      whereClauses.push(eq(cashTransactions.id, '00000000-0000-0000-0000-000000000000'));
    }
  } else if (userRole === 'OU' || userRole === 'ViewOnly' || userRole === 'Accountant' || userRole === 'Procurement') {
    // Office User, ViewOnly, Accountant, Procurement - filter by assigned stations
    const accessibleStations = await getAccessibleStationIds(userId);

    if (accessibleStations === 'all') {
      // Admin fallback (shouldn't hit here due to early return for Admin, but just in case)
    } else if (accessibleStations.length > 0) {
      whereClauses.push(inArray(cashTransactions.stationId, accessibleStations));
    } else {
      whereClauses.push(eq(cashTransactions.id, '00000000-0000-0000-0000-000000000000'));
    }
  } else if (userRole !== 'Admin') {
    // Fallback: if not admin and not handled, show nothing
    whereClauses.push(eq(cashTransactions.id, '00000000-0000-0000-0000-000000000000'));
  }

  // Date filtering
  if (dateFilter) {
    if (dateFilter.type === 'single' && dateFilter.date) {
      // Filter for a single date (start of day to end of day)
      const startOfDay = new Date(dateFilter.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateFilter.date);
      endOfDay.setHours(23, 59, 59, 999);

      whereClauses.push(
        and(
          gte(cashTransactions.createdAt, startOfDay),
          lte(cashTransactions.createdAt, endOfDay)
        )
      );
    } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      // Filter for a date range
      const startOfRange = new Date(dateFilter.startDate);
      startOfRange.setHours(0, 0, 0, 0);
      const endOfRange = new Date(dateFilter.endDate);
      endOfRange.setHours(23, 59, 59, 999);

      whereClauses.push(
        and(
          gte(cashTransactions.createdAt, startOfRange),
          lte(cashTransactions.createdAt, endOfRange)
        )
      );
    }
  }

  // Combine all where clauses
  const finalWhereClause = whereClauses.length > 0 ? and(...whereClauses) : undefined;

  return db.query.cashTransactions.findMany({
    where: finalWhereClause,
    with: {
      station: true,
      shift: true,
      cashTransfer: {
        with: {
          fromUser: { columns: { id: true, name: true, employeeId: true } },
          toUser: { columns: { id: true, name: true, employeeId: true } },
        },
      },
    },
    orderBy: desc(cashTransactions.createdAt),
  });
};

export const initiateTransfer = async (transactionId: string, fromUserId: string) => {
  const transaction = await db.query.cashTransactions.findFirst({
    where: eq(cashTransactions.id, transactionId),
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'PENDING_ACCEPTANCE') {
    throw new Error('Transaction already processed');
  }

  // Get the user's assigned area manager
  const user = await db.query.users.findFirst({
    where: eq(users.id, fromUserId),
    columns: { id: true, areaManagerId: true }
  });

  if (!user?.areaManagerId) {
    throw new Error('No area manager assigned to this user');
  }

  return db.insert(cashTransfers).values({
    cashTransactionId: transactionId,
    fromUserId,
    toUserId: user.areaManagerId,
    status: 'PENDING_ACCEPTANCE',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();
};

export const acceptCash = async (transactionId: string, userId: string) => {
  const transaction = await db.query.cashTransactions.findFirst({
    where: eq(cashTransactions.id, transactionId),
    with: { cashTransfer: true },
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (!transaction.cashTransfer) {
    throw new Error('Transfer not initiated');
  }

  if (transaction.cashTransfer.toUserId !== userId) {
    throw new Error('Unauthorized');
  }

  if (transaction.cashTransfer.status !== 'PENDING_ACCEPTANCE') {
    throw new Error('Transfer already processed');
  }

  return db.transaction(async (tx) => {
    await tx.update(cashTransfers)
      .set({
        status: 'WITH_AM',
        acceptedAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(cashTransfers.id, transaction.cashTransfer!.id));

    await tx.update(cashTransactions)
      .set({ status: 'WITH_AM' })
      .where(eq(cashTransactions.id, transactionId));
  });
};

export const depositCash = async (transactionId: string, receiptUrl: string) => {
  const transaction = await db.query.cashTransactions.findFirst({
    where: eq(cashTransactions.id, transactionId),
    with: { cashTransfer: true },
  });

  if (!transaction || !transaction.cashTransfer) {
    throw new Error('Transaction or transfer not found');
  }

  return createBankDeposit({
    userId: transaction.cashTransfer.toUserId,
    amount: transaction.cashToAM || 0,
    depositDate: new Date(),
    receiptUrl,
    notes: 'Deposited via individual action',
    transferIds: [transaction.cashTransfer.id]
  });
};


export const getFloatingCash = async (
  stationType?: string,
  dateFilter?: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string }
) => {
  // Build where clauses
  const whereClauses: any[] = [
    inArray(cashTransactions.status, ['PENDING_ACCEPTANCE', 'WITH_AM'])
  ];

  // Add date filtering
  if (dateFilter) {
    if (dateFilter.type === 'single' && dateFilter.date) {
      const startOfDay = new Date(dateFilter.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(dateFilter.date);
      endOfDay.setHours(23, 59, 59, 999);

      whereClauses.push(
        and(
          gte(cashTransactions.createdAt, startOfDay),
          lte(cashTransactions.createdAt, endOfDay)
        )
      );
    } else if (dateFilter.type === 'range' && dateFilter.startDate && dateFilter.endDate) {
      const startOfRange = new Date(dateFilter.startDate);
      startOfRange.setHours(0, 0, 0, 0);
      const endOfRange = new Date(dateFilter.endDate);
      endOfRange.setHours(23, 59, 59, 999);

      whereClauses.push(
        and(
          gte(cashTransactions.createdAt, startOfRange),
          lte(cashTransactions.createdAt, endOfRange)
        )
      );
    }
  }

  // Get all transactions that haven't been deposited yet
  let allTransactions = await db.query.cashTransactions.findMany({
    where: and(...whereClauses),
    with: {
      station: {
        with: {
          users: {
            with: { areaManager: { columns: { name: true, employeeId: true } } },
            columns: { name: true, employeeId: true, role: true }
          }
        }
      },
      cashTransfer: {
        with: {
          fromUser: { columns: { name: true, employeeId: true } },
          toUser: { columns: { name: true, employeeId: true } },
        },
      },
    },
    orderBy: desc(cashTransactions.createdAt),
  });

  // Filter by station type if provided
  let transactions = allTransactions;
  if (stationType && stationType !== 'ALL') {
    transactions = allTransactions.filter((t) => t.station?.stationType === stationType);
  }

  // Populate missing transfer info from Station Users
  const enhancedTransactions = transactions.map((t: any) => {
    if (t.cashTransfer) return t;

    const sm = t.station?.users?.find((u: any) => u.role === 'SM');
    return {
      ...t,
      cashTransfer: {
        fromUser: sm || { name: 'Station' },
        toUser: sm?.areaManager || { name: 'Area Manager' },
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      }
    };
  });

  const totalFloating = transactions.reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);
  const pendingAcceptance = transactions
    .filter((t) => t.status === 'PENDING_ACCEPTANCE')
    .reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);
  const withAM = transactions
    .filter((t) => t.status === 'WITH_AM')
    .reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);

  return {
    totalFloating,
    transactions: enhancedTransactions,
    breakdown: {
      pendingAcceptance,
      withAM,
    },
  };
};

export const getAdminCashSummary = async () => {
  // Get all cash transactions
  const allTransactions = await db.query.cashTransactions.findMany({
    with: {
      station: true,
    },
  });

  // Calculate totals
  const totalCash = allTransactions.reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);

  const cashWithStationManagers = allTransactions
    .filter((t) => t.status === 'PENDING_ACCEPTANCE')
    .reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);

  const cashWithAreaManager = allTransactions
    .filter((t) => t.status === 'WITH_AM')
    .reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);

  const cashDepositedInBank = allTransactions
    .filter((t) => t.status === 'DEPOSITED')
    .reduce((sum, t) => sum + Number(t.cashToAM || 0), 0);

  return {
    totalCash,
    cashWithStationManagers,
    cashWithAreaManager,
    cashDepositedInBank,
  };
};

export const createBankDeposit = async (data: {
  userId: string;
  amount: number;
  depositDate: Date;
  receiptUrl?: string;
  notes?: string;
  transferIds: string[];
}) => {
  return db.transaction(async (tx) => {
    // 1. Create Deposit
    const [deposit] = await tx.insert(bankDeposits).values({
      depositedBy: data.userId,
      amount: data.amount,
      depositDate: data.depositDate,
      receiptUrl: data.receiptUrl,
      notes: data.notes
    }).returning();

    // 2. Fetch and distribute across selected transfers
    if (data.transferIds && data.transferIds.length > 0) {
      const transfers = await tx.query.cashTransfers.findMany({
        where: inArray(cashTransfers.id, data.transferIds),
        with: { cashTransaction: true },
        orderBy: [desc(cashTransfers.createdAt)] // Newest first? User said One by one or all. FIFO implies Oldest first.
      });
      // Re-sort oldest first for FIFO payment
      transfers.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

      let remainingDeposit = data.amount;

      for (const transfer of transfers) {
        if (remainingDeposit <= 0) break;

        const transferTotal = transfer.cashTransaction.cashToAM || 0;
        const alreadyDeposited = transfer.amountDeposited || 0;
        const unpaid = transferTotal - alreadyDeposited;

        if (unpaid <= 0.01) continue;

        const toPay = Math.min(unpaid, remainingDeposit); // Only pay what is needed or what is left

        // Track item
        await tx.insert(bankDepositItems).values({
          bankDepositId: deposit.id,
          cashTransferId: transfer.id,
          amount: toPay
        });

        const newAmountDeposited = alreadyDeposited + toPay;
        const isFullyDeposited = newAmountDeposited >= transferTotal - 0.01;

        await tx.update(cashTransfers).set({
          amountDeposited: newAmountDeposited,
          status: isFullyDeposited ? 'DEPOSITED' : 'WITH_AM',
          depositedAt: isFullyDeposited ? new Date() : undefined,
          receiptUrl: data.receiptUrl,
          updatedAt: new Date(),
        }).where(eq(cashTransfers.id, transfer.id));

        if (isFullyDeposited) {
          await tx.update(cashTransactions).set({
            status: 'DEPOSITED'
          }).where(eq(cashTransactions.id, transfer.cashTransactionId));
        }

        remainingDeposit -= toPay;
      }
    }

    return deposit;
  });
};

export const getAreaManagerDailyReport = async (userId: string, dateStr: string) => {
  const date = new Date(dateStr);
  const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date); endOfDay.setHours(23, 59, 59, 999);
  const prevDayEnd = new Date(startOfDay); // Point in time before today

  // 1. Calculate History (Opening Balance)
  // Cash Accepted by AM before today
  const acceptedPreToday = await db.query.cashTransfers.findMany({
    where: and(
      eq(cashTransfers.toUserId, userId),
      inArray(cashTransfers.status, ['WITH_AM', 'DEPOSITED']),
      lte(cashTransfers.acceptedAt, prevDayEnd)
    ),
    with: { cashTransaction: true }
  });
  const totalAcceptedPre = acceptedPreToday.reduce((sum, t) => sum + (t.cashTransaction.cashToAM || 0), 0);

  // Cash Deposited by AM before today
  const depositsPreToday = await db.query.bankDeposits.findMany({
    where: and(
      eq(bankDeposits.depositedBy, userId),
      lte(bankDeposits.depositDate, prevDayEnd)
    )
  });
  const totalDepositedPre = depositsPreToday.reduce((sum, d) => sum + d.amount, 0);

  const openingBalance = totalAcceptedPre - totalDepositedPre;

  // 2. Today's Activity
  // Cash Accepted Today
  const acceptedToday = await db.query.cashTransfers.findMany({
    where: and(
      eq(cashTransfers.toUserId, userId),
      inArray(cashTransfers.status, ['WITH_AM', 'DEPOSITED']),
      gte(cashTransfers.acceptedAt, startOfDay),
      lte(cashTransfers.acceptedAt, endOfDay)
    ),
    with: { cashTransaction: true }
  });
  const totalAcceptedToday = acceptedToday.reduce((sum, t) => sum + (t.cashTransaction.cashToAM || 0), 0);

  // Deposit Today
  const depositsToday = await db.query.bankDeposits.findMany({
    where: and(
      eq(bankDeposits.depositedBy, userId),
      gte(bankDeposits.depositDate, startOfDay),
      lte(bankDeposits.depositDate, endOfDay)
    )
  });
  const totalDepositedToday = depositsToday.reduce((sum, d) => sum + d.amount, 0);

  // 3. Closing
  const currentBalance = openingBalance + totalAcceptedToday - totalDepositedToday;

  return {
    date: dateStr,
    openingBalance,
    receivedToday: totalAcceptedToday,
    depositedToday: totalDepositedToday,
    closingBalance: currentBalance,
    deposits: depositsToday // Include list for detail
  };
};
