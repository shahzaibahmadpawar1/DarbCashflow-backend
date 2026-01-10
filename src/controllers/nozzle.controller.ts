import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { updateNozzleOrder, getNozzlesByStation } from '../services/nozzle.service';

export const updateNozzlesOrder = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId } = req.params;
        const { nozzleOrders } = req.body;

        if (!Array.isArray(nozzleOrders)) {
            res.status(400).json({ error: 'nozzleOrders must be an array' });
            return;
        }

        const updatedNozzles = await updateNozzleOrder(stationId, nozzleOrders);

        res.json({
            message: 'Nozzle order updated successfully',
            nozzles: updatedNozzles
        });
    } catch (error: any) {
        console.error('Update nozzle order error:', error);
        res.status(500).json({ error: error.message || 'Failed to update nozzle order' });
    }
};

export const getStationNozzles = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId } = req.params;

        const nozzles = await getNozzlesByStation(stationId);

        res.json({ nozzles });
    } catch (error: any) {
        console.error('Get nozzles error:', error);
        res.status(500).json({ error: error.message || 'Failed to get nozzles' });
    }
};
