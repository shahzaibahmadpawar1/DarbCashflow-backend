import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import db from '../config/database';
import { users } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

export const getUsers = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const allUsers = await db.query.users.findMany({
            orderBy: desc(users.createdAt),
            with: {
                station: true,
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
        const { name, email, password, role, stationId, areaId } = req.body;

        if (!name || !email || !password || !role) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const existingUser = await db.query.users.findFirst({
            where: eq(users.email, email),
        });

        if (existingUser) {
            res.status(400).json({ error: 'Email already exists' });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [newUser] = await db.insert(users).values({
            name,
            email,
            password: hashedPassword,
            role: role as 'Admin' | 'SM' | 'AM',
            stationId: stationId || null,
            areaId: areaId || null,
        }).returning();

        const { password: _, ...userWithoutPassword } = newUser;

        res.status(201).json({ message: 'User created successfully', user: userWithoutPassword });
    } catch (error: any) {
        res.status(500).json({ error: error.message || 'Internal server error' });
    }
};
