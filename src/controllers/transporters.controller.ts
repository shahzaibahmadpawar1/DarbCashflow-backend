import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import {
    createTransporter,
    updateTransporter,
    getAllTransporters,
    getActiveTransporters,
    getTransporterById,
    toggleTransporterStatus,
} from '../services/transporters.service';

// Create transporter (Admin only)
export const createNewTransporter = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, defaultCost } = req.body;

        if (!name || !defaultCost) {
            res.status(400).json({ error: 'Name and default cost are required' });
            return;
        }

        if (req.user?.role !== 'Admin') {
            res.status(403).json({ error: 'Only admins can create transporters' });
            return;
        }

        const [transporter] = await createTransporter({
            name,
            defaultCost: parseFloat(defaultCost),
        });

        res.status(201).json({ message: 'Transporter created successfully', transporter });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Update transporter (Admin only)
export const updateExistingTransporter = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { name, defaultCost, isActive } = req.body;

        if (req.user?.role !== 'Admin') {
            res.status(403).json({ error: 'Only admins can update transporters' });
            return;
        }

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (defaultCost !== undefined) updateData.defaultCost = parseFloat(defaultCost);
        if (isActive !== undefined) updateData.isActive = isActive;

        const [transporter] = await updateTransporter(id, updateData);

        if (!transporter) {
            res.status(404).json({ error: 'Transporter not found' });
            return;
        }

        res.json({ message: 'Transporter updated successfully', transporter });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get all transporters
export const getTransporters = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { activeOnly } = req.query;

        const transporters = activeOnly === 'true'
            ? await getActiveTransporters()
            : await getAllTransporters();

        res.json({ transporters });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Get transporter by ID
export const getTransporter = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const transporter = await getTransporterById(id);

        if (!transporter) {
            res.status(404).json({ error: 'Transporter not found' });
            return;
        }

        res.json({ transporter });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

// Toggle transporter status (Admin only)
export const toggleStatus = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        if (req.user?.role !== 'Admin') {
            res.status(403).json({ error: 'Only admins can toggle transporter status' });
            return;
        }

        const [transporter] = await toggleTransporterStatus(id);

        res.json({
            message: `Transporter ${transporter.isActive ? 'activated' : 'deactivated'} successfully`,
            transporter
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
