import { Request, Response } from 'express';
import {
    createPurchaseOrder,
    getPurchaseOrdersByStation,
    getPurchaseOrderDetails,
    markPurchaseOrderReceived,
} from '../services/purchaseOrder.service';

export const createPO = async (req: Request, res: Response) => {
    try {
        const { purchaseRequestId, expectedDeliveryDate } = req.body;
        const userId = (req as any).user.id;

        if (!purchaseRequestId || !expectedDeliveryDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const po = await createPurchaseOrder(
            purchaseRequestId,
            new Date(expectedDeliveryDate),
            userId
        );

        res.json({ purchaseOrder: po });
    } catch (error: any) {
        console.error('Error creating purchase order:', error);
        res.status(500).json({ error: error.message || 'Failed to create purchase order' });
    }
};

export const getStationPOs = async (req: Request, res: Response) => {
    try {
        const { stationId } = req.params;

        const pos = await getPurchaseOrdersByStation(stationId);

        res.json({ purchaseOrders: pos });
    } catch (error: any) {
        console.error('Error fetching purchase orders:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch purchase orders' });
    }
};

export const getPODetails = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const po = await getPurchaseOrderDetails(id);

        res.json({ purchaseOrder: po });
    } catch (error: any) {
        console.error('Error fetching purchase order details:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch purchase order details' });
    }
};

export const markPOReceived = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { actualDeliveryDate, invoiceNumber, invoiceUrl } = req.body;
        const userId = (req as any).user.id;

        if (!actualDeliveryDate || !invoiceNumber) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const po = await markPurchaseOrderReceived(
            id,
            {
                actualDeliveryDate: new Date(actualDeliveryDate),
                invoiceNumber,
                invoiceUrl,
            },
            userId
        );

        res.json({ purchaseOrder: po });
    } catch (error: any) {
        console.error('Error marking purchase order as received:', error);
        res.status(500).json({ error: error.message || 'Failed to mark purchase order as received' });
    }
};
