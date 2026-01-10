import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { getFuelTankInventorySummary, getFuelTypeDetails } from '../services/fuelInventory.service';

export const getTankInventorySummary = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
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

        const summary = await getFuelTankInventorySummary(dateFilter);

        res.json(summary);
    } catch (error: any) {
        console.error('Get tank inventory summary error:', error);
        res.status(500).json({ error: error.message || 'Failed to get tank inventory summary' });
    }
};

export const getFuelTypeDetailedView = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { fuelType } = req.params;

        if (!['91_GASOLINE', '95_GASOLINE', 'DIESEL'].includes(fuelType)) {
            res.status(400).json({ error: 'Invalid fuel type' });
            return;
        }

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

        const details = await getFuelTypeDetails(fuelType as any, dateFilter);

        res.json(details);
    } catch (error: any) {
        console.error('Get fuel type details error:', error);
        res.status(500).json({ error: error.message || 'Failed to get fuel type details' });
    }
};
