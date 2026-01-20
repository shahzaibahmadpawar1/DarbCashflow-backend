import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
    setBuyingRate,
    getCurrentBuyingRates,
    getBuyingRate,
    getAllBuyingRates,
    getBuyingRateHistory,
} from '../services/fuelBuyingRates.service';

// Set buying rate (Admin only)
export const createBuyingRate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId, fuelType, buyingPricePerLiter } = req.body;

        if (!stationId || !fuelType || !buyingPricePerLiter) {
            res.status(400).json({ error: 'Station ID, fuel type, and buying price are required' });
            return;
        }

        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Check if user is admin
        if (req.user.role !== 'Admin') {
            res.status(403).json({ error: 'Only admins can set buying rates' });
            return;
        }

        const [rate] = await setBuyingRate({
            stationId,
            fuelType,
            buyingPricePerLiter: parseFloat(buyingPricePerLiter),
            createdBy: req.user.id,
        });

        res.status(201).json({ message: 'Buying rate set successfully', rate });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get buying rates for a station
export const getStationBuyingRates = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId } = req.params;
        const rates = await getCurrentBuyingRates(stationId);
        res.json({ rates });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get specific buying rate for station and fuel type
export const getSpecificBuyingRate = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId, fuelType } = req.params;
        const rate = await getBuyingRate(stationId, fuelType);

        if (!rate) {
            res.status(404).json({ error: 'Buying rate not found for this fuel type' });
            return;
        }

        res.json({ rate });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get all buying rates (Admin only)
export const getAllRates = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        if (req.user?.role !== 'Admin') {
            res.status(403).json({ error: 'Only admins can view all buying rates' });
            return;
        }

        const rates = await getAllBuyingRates();
        res.json({ rates });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get buying rate history
export const getRateHistory = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId, fuelType } = req.params;
        const history = await getBuyingRateHistory(stationId, fuelType);
        res.json({ history });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
