import { Request, Response } from 'express';
import { getPendingProcurementPOs, getProcurementPOs } from '../services/procurement.service';

// Get pending POs for procurement confirmation (for assigned station)
export const getPendingPOs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        // Procurement users should have a stationId assigned
        if (!user.stationId) {
            return res.status(403).json({ error: 'No station assigned to this procurement user' });
        }

        const pos = await getPendingProcurementPOs(user.stationId);

        res.json({ purchaseOrders: pos });
    } catch (error) {
        console.error('Error fetching pending POs:', error);
        res.status(500).json({ error: 'Failed to fetch pending purchase orders' });
    }
};

// Get all POs for procurement user (for assigned station)
export const getAllProcurementPOs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        if (!user.stationId) {
            return res.status(403).json({ error: 'No station assigned to this procurement user' });
        }

        const pos = await getProcurementPOs(user.stationId);

        res.json({ purchaseOrders: pos });
    } catch (error) {
        console.error('Error fetching POs:', error);
        res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
};
