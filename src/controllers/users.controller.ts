import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import db from '../config/database';
import { users } from '../db/schema';
import { eq, desc, and } from 'drizzle-orm';

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { role } = req.query;
        let whereClause = undefined;

        // If user is AM, only show users assigned to them
        if (req.user?.role === 'AM') {
            if (role) {
                whereClause = and(
                    eq(users.areaManagerId, req.user.id),
                    eq(users.role, role as any)
                );
            } else {
                whereClause = eq(users.areaManagerId, req.user.id);
            }
        }
        // Logic for Admin or others (filtering by role if provided)
        else if (role) {
            whereClause = eq(users.role, role as any);
        }

        const allUsers = await db.query.users.findMany({
            where: whereClause,
            orderBy: desc(users.createdAt),
            with: {
                station: true,
                areaManager: {
                    columns: {
                        id: true,
                        name: true,
                    }
                }
            }
        });

        // Remove password from response
        const sanitizedUsers = allUsers.map(u => {
            const { password, ...rest } = u;
            return rest;
        });

        res.json({ users: sanitizedUsers });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { name, employeeId, password, role, stationId, areaManagerId } = req.body;

        if (!name || !employeeId || !password || !role) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const existingUser = await db.query.users.findFirst({
            where: eq(users.employeeId, employeeId),
        });

        if (existingUser) {
            res.status(400).json({ error: 'Employee ID already exists' });
            return;
        }

        // Store password as plain text (NOT RECOMMENDED FOR PRODUCTION)
        const [newUser] = await db.insert(users).values({
            name,
            employeeId,
            password: password, // Plain text password
            role: role as 'Admin' | 'SM' | 'AM',
            stationId: stationId || null,
            areaManagerId: areaManagerId || null,
        }).returning();

        const { password: _, ...userWithoutPassword } = newUser;

        res.status(201).json({ message: 'User created successfully', user: userWithoutPassword });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};

export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { stationId, areaManagerId } = req.body;

        const updateData: any = {};
        if (stationId !== undefined) updateData.stationId = stationId;
        if (areaManagerId !== undefined) updateData.areaManagerId = areaManagerId;

        const [updatedUser] = await db.update(users)
            .set(updateData)
            .where(eq(users.id, id))
            .returning();

        if (!updatedUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const { password, ...userWithoutPassword } = updatedUser;

        res.json({ message: 'User updated successfully', user: userWithoutPassword });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
