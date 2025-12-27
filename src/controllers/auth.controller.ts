import { Request, Response } from 'express';
import { createUser, loginUser, getUserById } from '../services/auth.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '@prisma/client';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name, role, stationId, areaId } = req.body;

    if (!email || !password || !name || !role) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    if (!Object.values(UserRole).includes(role)) {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }

    const user = await createUser({
      email,
      password,
      name,
      role,
      stationId: stationId || null,
      areaId: areaId || null,
    });

    res.status(201).json({ message: 'User created successfully', user });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Email already exists' });
      return;
    }
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await loginUser(email, password);
    res.json(result);
  } catch (error: any) {
    res.status(401).json({ error: error.message || 'Invalid credentials' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const user = await getUserById(req.user.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};

