import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    employeeId: string;
    role: string;
    stationId?: string | null;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // BYPASS AUTH: Fetch the first user found to act as the logged-in user
    // This ensures foreign key constraints (created_by, etc.) still work.
    const user = await db.query.users.findFirst({
      columns: {
        id: true,
        employeeId: true,
        role: true,
        stationId: true,
      }
    });

    if (user) {
      req.user = user;
    } else {
      // Fallback mock if db is empty (Note: writes requiring real user ID will fail)
      req.user = {
        id: '00000000-0000-0000-0000-000000000000',
        employeeId: 'admin_sys',
        role: 'Admin',
        stationId: null
      };
    }

    next();
  } catch (error) {
    console.error("Auth bypass error - DB might be unreachable:", error);
    // Fallback mock user on error so we don't return 401
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      employeeId: 'admin_sys',
      role: 'Admin',
      stationId: null
    };
    next();
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // BYPASS AUTHORIZATION
    next();
  };
};

