import { eq, and, inArray } from 'drizzle-orm';
import db from '../config/database';
import { officeUserStations, users, stations } from '../db/schema';

/**
 * Assign stations to an Office User, Accountant, or ViewOnly user
 */
export const assignStationsToOfficeUser = async (userId: string, stationIds: string[]) => {
    // Verify user is an Office User, Accountant, or ViewOnly
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { id: true, role: true }
    });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.role !== 'OU' && user.role !== 'Accountant' && user.role !== 'ViewOnly') {
        throw new Error('User must be an Office User, Accountant, or ViewOnly user');
    }

    // Remove existing assignments
    await db.delete(officeUserStations).where(eq(officeUserStations.userId, userId));

    // Add new assignments
    if (stationIds.length > 0) {
        await db.insert(officeUserStations).values(
            stationIds.map(stationId => ({
                userId,
                stationId,
            }))
        );
    }

    return { success: true, assignedStations: stationIds.length };
};

/**
 * Get assigned stations for an Office User
 */
export const getOfficeUserStations = async (userId: string) => {
    const assignments = await db.query.officeUserStations.findMany({
        where: eq(officeUserStations.userId, userId),
        with: {
            station: true
        }
    });

    return assignments.map(a => a.station);
};

/**
 * Get all Office Users with their assigned stations
 */
export const getAllOfficeUsersWithStations = async () => {
    const officeUsers = await db.query.users.findMany({
        where: eq(users.role, 'OU'),
        with: {
            assignedStations: {
                with: {
                    station: true
                }
            }
        }
    });

    return officeUsers.map(user => ({
        id: user.id,
        name: user.name,
        employeeId: user.employeeId,
        assignedStations: user.assignedStations.map(a => a.station)
    }));
};

/**
 * Check if Office User has access to a specific station
 */
export const hasStationAccess = async (userId: string, stationId: string): Promise<boolean> => {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true }
    });

    if (!user) return false;

    // Admin has access to all stations
    if (user.role === 'Admin') return true;

    // SM and AM have access based on their stationId/area
    if (user.role === 'SM' || user.role === 'AM') return true;

    // Office User - check assignments
    if (user.role === 'OU') {
        const assignment = await db.query.officeUserStations.findFirst({
            where: and(
                eq(officeUserStations.userId, userId),
                eq(officeUserStations.stationId, stationId)
            )
        });
        return !!assignment;
    }

    return false;
};

/**
 * Get accessible station IDs for a user (used for filtering)
 */
export const getAccessibleStationIds = async (userId: string): Promise<string[] | 'all'> => {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true }
    });

    if (!user) return [];

    // Admin has access to all stations
    if (user.role === 'Admin') return 'all';

    // Office User, Accountant, ViewOnly - return assigned stations
    if (user.role === 'OU' || user.role === 'Accountant' || user.role === 'ViewOnly') {
        const assignments = await db.query.officeUserStations.findMany({
            where: eq(officeUserStations.userId, userId),
            columns: { stationId: true }
        });
        return assignments.map(a => a.stationId);
    }

    // SM and AM - handled elsewhere based on their stationId/area
    return 'all';
};
