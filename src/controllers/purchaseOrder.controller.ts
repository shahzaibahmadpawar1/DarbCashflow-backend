import { Request, Response } from 'express';
import {
    createPurchaseOrder,
    getPurchaseOrdersByStation,
    getPurchaseOrderDetails,
    confirmProcurement,
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

export const confirmProcurementPO = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { aramcoPoNumber, aramcoPoDate, aramcoPoUrl } = req.body;
        const userId = (req as any).user.id;

        if (!aramcoPoNumber || !aramcoPoDate) {
            return res.status(400).json({ error: 'Aramco PO number and date are required' });
        }

        const po = await confirmProcurement(
            id,
            {
                aramcoPoNumber,
                aramcoPoDate: new Date(aramcoPoDate),
                aramcoPoUrl,
            },
            userId
        );

        res.json({ message: 'Procurement confirmed successfully', purchaseOrder: po });
    } catch (error: any) {
        console.error('Error confirming procurement:', error);
        res.status(500).json({ error: error.message || 'Failed to confirm procurement' });
    }
};

export const markPOReceived = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { actualDeliveryDate, invoiceNumber, invoiceUrl, receivedQuantityLiters, transporterId, actualTransportationCost } = req.body;
        const userId = (req as any).user.id;

        if (!actualDeliveryDate || !invoiceNumber || !receivedQuantityLiters || actualTransportationCost === undefined) {
            return res.status(400).json({ error: 'Missing required fields: actualDeliveryDate, invoiceNumber, receivedQuantityLiters, actualTransportationCost' });
        }

        const result = await markPurchaseOrderReceived(
            id,
            {
                actualDeliveryDate: new Date(actualDeliveryDate),
                invoiceNumber,
                invoiceUrl,
                receivedQuantityLiters: parseFloat(receivedQuantityLiters),
                transporterId,
                actualTransportationCost: parseFloat(actualTransportationCost),
            },
            userId
        );

        res.json({
            message: 'Purchase order received successfully',
            ...result
        });
    } catch (error: any) {
        console.error('Error marking purchase order as received:', error);
        res.status(500).json({ error: error.message || 'Failed to mark purchase order as received' });
    }
};

export const getDailyPOReport = async (req: Request, res: Response) => {
    try {
        const { date } = req.query;

        if (!date) {
            return res.status(400).json({ error: 'Date parameter is required' });
        }

        const { getDailyPurchaseOrders } = await import('../services/purchaseOrder.service');
        const pos = await getDailyPurchaseOrders(date as string);

        res.json(pos);
    } catch (error: any) {
        console.error('Error fetching daily PO report:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch daily PO report' });
    }
};
