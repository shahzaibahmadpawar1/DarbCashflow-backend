import db from '../config/database';
import { cashTransactions, cashTransfers, shifts, users } from '../db/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';

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

  // 3. Auto-initiate transfer to area manager if assigned
  const user = await db.query.users.findFirst({
    where: eq(users.id, data.userId),
    columns: { id: true, areaManagerId: true }
  });

  if (user?.areaManagerId) {
    await db.insert(cashTransfers).values({
      cashTransactionId: transaction.id,
      fromUserId: data.userId,
      toUserId: user.areaManagerId,
      status: 'PENDING_ACCEPTANCE',
    });
  }

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

export const getCashTransactions = async (userId: string, userRole: string, stationId?: string | null) => {
  let whereClause = undefined;

  if (userRole === 'SM' && stationId) {
    whereClause = eq(cashTransactions.stationId, stationId);
  } else if (userRole === 'AM') {
    // AM can see transactions from stations in their area
    // This would need areaId mapping - simplified to status for now as per original code
    whereClause = inArray(cashTransactions.status, ['PENDING_ACCEPTANCE', 'WITH_AM']);
  }

  return db.query.cashTransactions.findMany({
    where: whereClause,
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

export const initiateTransfer = async (transactionId: string, fromUserId: string, toUserId: string) => {
  const transaction = await db.query.cashTransactions.findFirst({
    where: eq(cashTransactions.id, transactionId),
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== 'PENDING_ACCEPTANCE') {
    throw new Error('Transaction already processed');
  }

  return db.insert(cashTransfers).values({
    cashTransactionId: transactionId,
    fromUserId,
    toUserId,
    status: 'PENDING_ACCEPTANCE',
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
      .set({ status: 'WITH_AM' })
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

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (!transaction.cashTransfer) {
    throw new Error('Transfer not found');
  }

  if (transaction.cashTransfer.status !== 'WITH_AM') {
    throw new Error('Cash must be accepted before deposit');
  }

  return db.transaction(async (tx) => {
    await tx.update(cashTransfers)
      .set({
        status: 'DEPOSITED',
        receiptUrl,
        depositedAt: new Date(),
      })
      .where(eq(cashTransfers.id, transaction.cashTransfer!.id));

    await tx.update(cashTransactions)
      .set({ status: 'DEPOSITED' })
      .where(eq(cashTransactions.id, transactionId));
  });
};

export const getFloatingCash = async () => {
  const transactions = await db.query.cashTransactions.findMany({
    where: inArray(cashTransactions.status, ['PENDING_ACCEPTANCE', 'WITH_AM']),
    with: {
      station: true,
      cashTransfer: {
        with: {
          fromUser: { columns: { name: true, employeeId: true } },
          toUser: { columns: { name: true, employeeId: true } },
        },
      },
    },
  });

  const totalFloating = transactions.reduce((sum, t) => sum + t.cashToAM, 0);

  return {
    totalFloating,
    transactions,
    breakdown: {
      pendingAcceptance: transactions
        .filter((t) => t.status === 'PENDING_ACCEPTANCE')
        .reduce((sum, t) => sum + t.cashToAM, 0),
      withAM: transactions
        .filter((t) => t.status === 'WITH_AM')
        .reduce((sum, t) => sum + t.cashToAM, 0),
    },
  };
};
