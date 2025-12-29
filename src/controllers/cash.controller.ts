import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  createCashTransaction,
  getCashTransactions,
  initiateTransfer,
  acceptCash,
  depositCash,
  getFloatingCash,
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

    const transactions = await getCashTransactions(
      req.user.id,
      req.user.role,
      req.user.stationId
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
    const floatingCash = await getFloatingCash();
    res.json(floatingCash);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

