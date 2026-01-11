import { Request, Response } from 'express';
import {
    createPurchaseRequest,
    getPurchaseRequestsByStation,
    getPurchaseRequestsForOfficeUser,
    getPurchaseRequestDetails,
    approvePurchaseRequest,
    rejectPurchaseRequest,
} from '../services/purchaseRequest.service';

export const createPR = async (req: Request, res: Response) => {
    try {
        const { stationId, fuelType, quantityLiters, paymentAmount, requestedDeliveryDate, receiptUrl } = req.body;
        const userId = (req as any).user.id;

        if (!stationId || !fuelType || !quantityLiters || !paymentAmount || !requestedDeliveryDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const pr = await createPurchaseRequest({
            stationId,
            createdBy: userId,
            fuelType,
            quantityLiters: parseFloat(quantityLiters),
            paymentAmount: parseFloat(paymentAmount),
            requestedDeliveryDate: new Date(requestedDeliveryDate),
            receiptUrl,
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
        const userId = (req as any).user.id;

        const pr = await approvePurchaseRequest(id, userId);

        res.json({ purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error approving purchase request:', error);
        res.status(500).json({ error: error.message || 'Failed to approve purchase request' });
    }
};

export const rejectPR = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = (req as any).user.id;

        if (!reason) {
            return res.status(400).json({ error: 'Rejection reason is required' });
        }

        const pr = await rejectPurchaseRequest(id, userId, reason);

        res.json({ purchaseRequest: pr });
    } catch (error: any) {
        console.error('Error rejecting purchase request:', error);
        res.status(500).json({ error: error.message || 'Failed to reject purchase request' });
    }
};
