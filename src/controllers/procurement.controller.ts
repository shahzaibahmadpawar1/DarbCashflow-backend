import { Request, Response } from 'express';
import { getPendingProcurementPOs, getProcurementPOs } from '../services/procurement.service';
import { getAccessibleStationIds } from '../services/officeUser.service';
import db from '../config/database';
import { stations } from '../db/schema';

// Get pending POs for procurement confirmation (for assigned stations)
export const getPendingPOs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const stationIds = await getAccessibleStationIds(user.id);

        if (stationIds !== 'all' && stationIds.length === 0) {
            return res.status(403).json({ error: 'No stations assigned to this procurement user' });
        }

        let finalStationIds: string[] = [];
        if (stationIds === 'all') {
            const allStations = await db.query.stations.findMany({
                columns: { id: true }
            });
            finalStationIds = allStations.map(s => s.id);
        } else {
            finalStationIds = stationIds;
        }

        const pos = await getPendingProcurementPOs(finalStationIds);

        // Transform relation names to match frontend expectations
        const transformedPOs = pos.map(po => ({
            ...po,
            purchaseRequest: {
                ...po.purchaseRequest,
                paymentVerifiedBy: (po.purchaseRequest as any).paymentVerifier,
                approvedBy: (po.purchaseRequest as any).approver,
                rejectedBy: (po.purchaseRequest as any).rejecter,
                reviewedBy: (po.purchaseRequest as any).reviewer,
            }
        }));

        res.json({ purchaseOrders: transformedPOs });
    } catch (error) {
        console.error('Error fetching pending POs:', error);
        res.status(500).json({ error: 'Failed to fetch pending purchase orders' });
    }
};

// Get all POs for procurement user (for assigned stations)
export const getAllProcurementPOs = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const stationIds = await getAccessibleStationIds(user.id);

        if (stationIds !== 'all' && stationIds.length === 0) {
            return res.status(403).json({ error: 'No stations assigned to this procurement user' });
        }

        let finalStationIds: string[] = [];
        if (stationIds === 'all') {
            const allStations = await db.query.stations.findMany({
                columns: { id: true }
            });
            finalStationIds = allStations.map(s => s.id);
        } else {
            finalStationIds = stationIds;
        }

        const pos = await getProcurementPOs(finalStationIds);

        // Transform relation names to match frontend expectations
        const transformedPOs = pos.map(po => ({
            ...po,
            purchaseRequest: {
                ...po.purchaseRequest,
                paymentVerifiedBy: (po.purchaseRequest as any).paymentVerifier,
                approvedBy: (po.purchaseRequest as any).approver,
                rejectedBy: (po.purchaseRequest as any).rejecter,
                reviewedBy: (po.purchaseRequest as any).reviewer,
            }
        }));

        res.json({ purchaseOrders: transformedPOs });
    } catch (error) {
        console.error('Error fetching POs:', error);
        res.status(500).json({ error: 'Failed to fetch purchase orders' });
    }
};
