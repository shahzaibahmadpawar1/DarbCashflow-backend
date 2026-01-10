import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import * as officeUserService from '../services/officeUser.service';

/**
 * Assign stations to an Office User (Admin only)
 */
export const assignStations = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;
        const { stationIds } = req.body;

        if (!Array.isArray(stationIds)) {
            return res.status(400).json({ error: 'stationIds must be an array' });
        }

        const result = await officeUserService.assignStationsToOfficeUser(userId, stationIds);

        res.json({
            message: 'Stations assigned successfully',
            ...result
        });
    } catch (error: any) {
        console.error('Assign stations error:', error);
        res.status(500).json({ error: error.message || 'Failed to assign stations' });
    }
};

/**
 * Get assigned stations for an Office User
 */
export const getAssignedStations = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;

        const stations = await officeUserService.getOfficeUserStations(userId);

        res.json({ stations });
    } catch (error: any) {
        console.error('Get assigned stations error:', error);
        res.status(500).json({ error: error.message || 'Failed to get assigned stations' });
    }
};

/**
 * Get all Office Users with their assigned stations (Admin only)
 */
export const getAllOfficeUsers = async (req: AuthRequest, res: Response) => {
    try {
        const officeUsers = await officeUserService.getAllOfficeUsersWithStations();

        res.json({ officeUsers });
    } catch (error: any) {
        console.error('Get office users error:', error);
        res.status(500).json({ error: error.message || 'Failed to get office users' });
    }
};
