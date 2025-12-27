import prisma from '../config/database';
import { CashTransferStatus } from '@prisma/client';

export const createCashTransaction = async (data: {
  shiftId: string;
  stationId: string;
  litersSold: number;
  ratePerLiter: number;
  cardPayments: number;
  bankDeposit: number;
}) => {
  const totalRevenue = data.litersSold * data.ratePerLiter;
  const cashOnHand = totalRevenue - data.cardPayments;
  const cashToAM = cashOnHand - data.bankDeposit;

  return prisma.cashTransaction.create({
    data: {
      shiftId: data.shiftId,
      stationId: data.stationId,
      litersSold: data.litersSold,
      ratePerLiter: data.ratePerLiter,
      totalRevenue,
      cardPayments: data.cardPayments,
      cashOnHand,
      bankDeposit: data.bankDeposit,
      cashToAM,
      status: CashTransferStatus.PENDING_ACCEPTANCE,
    },
    include: {
      station: true,
      shift: true,
      cashTransfer: {
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
};

export const getCashTransactions = async (userId: string, userRole: string, stationId?: string | null) => {
  const where: any = {};

  if (userRole === 'SM' && stationId) {
    where.stationId = stationId;
  } else if (userRole === 'AM') {
    // AM can see transactions from stations in their area
    // This would need areaId mapping - simplified for now
    where.status = { in: [CashTransferStatus.PENDING_ACCEPTANCE, CashTransferStatus.WITH_AM] };
  }

  return prisma.cashTransaction.findMany({
    where,
    include: {
      station: true,
      shift: true,
      cashTransfer: {
        include: {
          fromUser: { select: { id: true, name: true, email: true } },
          toUser: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
};

export const initiateTransfer = async (transactionId: string, fromUserId: string, toUserId: string) => {
  const transaction = await prisma.cashTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (transaction.status !== CashTransferStatus.PENDING_ACCEPTANCE) {
    throw new Error('Transaction already processed');
  }

  return prisma.cashTransfer.create({
    data: {
      cashTransactionId: transactionId,
      fromUserId,
      toUserId,
      status: CashTransferStatus.PENDING_ACCEPTANCE,
    },
  });
};

export const acceptCash = async (transactionId: string, userId: string) => {
  const transaction = await prisma.cashTransaction.findUnique({
    where: { id: transactionId },
    include: { cashTransfer: true },
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

  if (transaction.cashTransfer.status !== CashTransferStatus.PENDING_ACCEPTANCE) {
    throw new Error('Transfer already processed');
  }

  return prisma.$transaction([
    prisma.cashTransfer.update({
      where: { id: transaction.cashTransfer.id },
      data: { status: CashTransferStatus.WITH_AM },
    }),
    prisma.cashTransaction.update({
      where: { id: transactionId },
      data: { status: CashTransferStatus.WITH_AM },
    }),
  ]);
};

export const depositCash = async (transactionId: string, receiptUrl: string) => {
  const transaction = await prisma.cashTransaction.findUnique({
    where: { id: transactionId },
    include: { cashTransfer: true },
  });

  if (!transaction) {
    throw new Error('Transaction not found');
  }

  if (!transaction.cashTransfer) {
    throw new Error('Transfer not found');
  }

  if (transaction.cashTransfer.status !== CashTransferStatus.WITH_AM) {
    throw new Error('Cash must be accepted before deposit');
  }

  return prisma.$transaction([
    prisma.cashTransfer.update({
      where: { id: transaction.cashTransfer.id },
      data: {
        status: CashTransferStatus.DEPOSITED,
        receiptUrl,
        depositedAt: new Date(),
      },
    }),
    prisma.cashTransaction.update({
      where: { id: transactionId },
      data: { status: CashTransferStatus.DEPOSITED },
    }),
  ]);
};

export const getFloatingCash = async () => {
  const transactions = await prisma.cashTransaction.findMany({
    where: {
      status: {
        in: [CashTransferStatus.PENDING_ACCEPTANCE, CashTransferStatus.WITH_AM],
      },
    },
    include: {
      station: true,
      cashTransfer: {
        include: {
          fromUser: { select: { name: true, email: true } },
          toUser: { select: { name: true, email: true } },
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
        .filter((t) => t.status === CashTransferStatus.PENDING_ACCEPTANCE)
        .reduce((sum, t) => sum + t.cashToAM, 0),
      withAM: transactions
        .filter((t) => t.status === CashTransferStatus.WITH_AM)
        .reduce((sum, t) => sum + t.cashToAM, 0),
    },
  };
};

