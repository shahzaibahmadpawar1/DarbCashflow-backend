import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
    setFuelPrice,
    getCurrentFuelPrices,
    getAllStationPrices,
    getNozzleSales,
    updateNozzleSale,
    submitNozzleSales,
} from '../services/fuel.service';

// ==================== FUEL PRICES (Admin) ====================

export const createFuelPrice = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId, fuelType, pricePerLiter } = req.body;

        if (!stationId || !fuelType || !pricePerLiter) {
            res.status(400).json({ error: 'Station ID, fuel type, and price are required' });
            return;
        }

        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const [price] = await setFuelPrice({
            stationId,
            fuelType,
            pricePerLiter: parseFloat(pricePerLiter),
            createdBy: req.user.id,
        });

        res.status(201).json({ message: 'Fuel price set successfully', price });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const getStationFuelPrices = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { stationId } = req.params;
        const prices = await getCurrentFuelPrices(stationId);
        res.json({ prices });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const getAllPrices = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const prices = await getAllStationPrices();
        res.json({ prices });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// ==================== NOZZLE SALES (Station Manager) ====================

export const getShiftSales = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { shiftId } = req.params;
        const sales = await getNozzleSales(shiftId);
        res.json({ sales });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const updateSale = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { saleId } = req.params;
        const { quantityLiters, cardAmount, cashAmount } = req.body;

        const [updated] = await updateNozzleSale(saleId, {
            quantityLiters: quantityLiters ? parseFloat(quantityLiters) : undefined,
            cardAmount: cardAmount !== undefined ? parseFloat(cardAmount) : undefined,
            cashAmount: cashAmount !== undefined ? parseFloat(cashAmount) : undefined,
        });

        res.json({ message: 'Sale updated successfully', sale: updated });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const submitSales = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { shiftId } = req.params;
        const result = await submitNozzleSales(shiftId);
        res.json({ message: 'Sales submitted and shift locked successfully', ...result });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
