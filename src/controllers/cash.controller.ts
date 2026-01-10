import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  createCashTransaction,
  getCashTransactions,
  initiateTransfer,
  acceptCash,
  depositCash,
  getFloatingCash,
  getAdminCashSummary,
  createBankDeposit,
  getAreaManagerDailyReport,
} from '../services/cash.service';
import { uploadToSupabase } from '../utils/supabase-storage';

export const createTransaction = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { litersSold, ratePerLiter, cardPayments, bankDeposit } = req.body;

    if (!litersSold || !ratePerLiter || cardPayments === undefined) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const stationId = req.body.stationId || req.user?.stationId;

    if (!stationId) {
      res.status(403).json({ error: 'Station ID required' });
      return;
    }

    if (!req.user?.id) {
      res.status(401).json({ error: 'User not authenticated' });
      return;
    }

    const transaction = await createCashTransaction({
      stationId,
      litersSold: parseFloat(litersSold),
      ratePerLiter: parseFloat(ratePerLiter),
      cardPayments: parseFloat(cardPayments || 0),
      bankDeposit: parseFloat(bankDeposit || 0),
      userId: req.user.id,
    });

    res.status(201).json({ message: 'Transaction created successfully', transaction });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getTransactions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Parse date filter from query parameters
    let dateFilter: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string } | undefined;

    if (req.query.date) {
      // Single date filter
      dateFilter = {
        type: 'single',
        date: req.query.date as string
      };
    } else if (req.query.startDate && req.query.endDate) {
      // Date range filter
      dateFilter = {
        type: 'range',
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string
      };
    }

    const transactions = await getCashTransactions(
      req.user.id,
      req.user.role,
      req.user.stationId,
      dateFilter
    );

    res.json({ transactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const transferCash = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const transfer = await initiateTransfer(id, req.user.id);

    res.json({ message: 'Transfer initiated successfully', transfer });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const acceptCashTransfer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    await acceptCash(id, req.user.id);

    res.json({ message: 'Cash accepted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const depositCashTransfer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: 'Receipt image required' });
      return;
    }

    console.log('Uploading receipt for transaction:', id);
    console.log('File details:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    const receiptUrl = await uploadToSupabase(file);
    console.log('Receipt uploaded successfully:', receiptUrl);

    await depositCash(id, receiptUrl);

    res.json({ message: 'Cash deposited successfully', receiptUrl });
  } catch (error: any) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getFloatingCashView = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const stationType = req.query.stationType as string | undefined;

    // Parse date filter from query parameters
    let dateFilter: { type: 'single' | 'range', date?: string, startDate?: string, endDate?: string } | undefined;

    if (req.query.date) {
      dateFilter = {
        type: 'single',
        date: req.query.date as string
      };
    } else if (req.query.startDate && req.query.endDate) {
      dateFilter = {
        type: 'range',
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string
      };
    }

    const floatingCash = await getFloatingCash(stationType, dateFilter);
    res.json(floatingCash);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getAdminCashSummaryView = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const summary = await getAdminCashSummary();
    res.json(summary);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const createBankDepositData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { amount, depositDate, notes, receiptUrl, transferIds } = req.body;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (!amount || !depositDate) {
      res.status(400).json({ error: 'Amount and Date are required' });
      return;
    }

    const deposit = await createBankDeposit({
      userId: req.user.id,
      amount: parseFloat(amount),
      depositDate: new Date(depositDate),
      notes,
      receiptUrl,
      transferIds: Array.isArray(transferIds) ? transferIds : [],
    });

    res.json({ message: 'Deposit created successfully', deposit });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const getAreaManagerReportData = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { date } = req.query;

    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const report = await getAreaManagerDailyReport(
      req.user.id,
      (date as string) || new Date().toISOString()
    );

    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

