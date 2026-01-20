import { Request, Response } from 'express';
import {
    createPurchaseRequest,
    getPurchaseRequestsByStation,
    getPurchaseRequestsForOfficeUser,
    getPurchaseRequestDetails,
    approvePurchaseRequest,
    rejectPurchaseRequest,
    verifyPurchaseRequestPayment,
} from '../services/purchaseRequest.service';

export const createPR = async (req: Request, res: Response) => {
    try {
        const { stationId, fuelType, quantityLiters, requestedDeliveryDate, receiptUrl, bankDepositAmount, bankDepositReceiptUrl } = req.body;
        const userId = (req as any).user.id;

        if (!stationId || !fuelType || !quantityLiters || !requestedDeliveryDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pr = await createPurchaseRequest({
            stationId,
            createdBy: userId,
            fuelType,
            quantityLiters: parseFloat(quantityLiters),
            requestedDeliveryDate: new Date(requestedDeliveryDate),
            receiptUrl,
            bankDepositAmount: bankDepositAmount ? parseFloat(bankDepositAmount) : undefined,
            bankDepositReceiptUrl,
        });

        res.json({ purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error creating purchase request:', error);
        res.status(500).json({ error: error.message || 'Failed to create purchase request' });
    }
};

export const getStationPRs = async (req: Request, res: Response) => {
    try {
        const { stationId } = req.params;

        const prs = await getPurchaseRequestsByStation(stationId);

        res.json({ purchaseRequests: prs });
    } catch (error: any) {
        console.error('Error fetching purchase requests:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch purchase requests' });
    }
};

export const getOfficeUserPRs = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.id;

        const prs = await getPurchaseRequestsForOfficeUser(userId);

        res.json({ purchaseRequests: prs });
    } catch (error: any) {
        console.error('Error fetching purchase requests:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch purchase requests' });
    }
};

export const getPRDetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const pr = await getPurchaseRequestDetails(id);

        res.json({ purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error fetching purchase request details:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch purchase request details' });
    }
};

export const approvePR = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const userId = (req as any).user.id;

        const pr = await approvePurchaseRequest(id, userId, comment);

        res.json({ purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error approving purchase request:', error);
        res.status(500).json({ error: error.message || 'Failed to approve purchase request' });
    }
};

export const rejectPR = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const userId = (req as any).user.id;

        if (!comment) {
            return res.status(400).json({ error: 'Rejection comment is required' });
        }

        const pr = await rejectPurchaseRequest(id, userId, comment);

        res.json({ purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error rejecting purchase request:', error);
        res.status(500).json({ error: error.message || 'Failed to reject purchase request' });
    }
};

export const verifyPRPayment = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = (req as any).user.id;
        const userRole = (req as any).user.role;

        // Check if user is accountant or admin
        if (userRole !== 'Accountant' && userRole !== 'Admin') {
            return res.status(403).json({ error: 'Only accountants can verify payments' });
        }

        const pr = await verifyPurchaseRequestPayment(id, userId);

        res.json({ message: 'Payment verified successfully', purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error verifying payment:', error);
        res.status(500).json({ error: error.message || 'Failed to verify payment' });
    }
};
