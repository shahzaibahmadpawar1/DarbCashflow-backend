import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../config/database';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

// Fix the JWT type error by ensuring options are typed correctly
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, 10);
};

export const comparePassword = async (
  password: string,
  hashedPassword: string
): Promise<boolean> => {
  return bcrypt.compare(password, hashedPassword);
};

export const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const createUser = async (data: {
  employeeId: string;
  password: string;
  name: string;
  role: 'SM' | 'AM' | 'Admin';
  stationId?: string | null;
  areaManagerId?: string | null;
}) => {
  const hashedPassword = await hashPassword(data.password);

  const [newUser] = await db.insert(users).values({
    ...data,
    password: hashedPassword,
    stationId: data.stationId || null,
    areaManagerId: data.areaManagerId || null,
  }).returning({
    id: users.id,
    employeeId: users.employeeId,
    name: users.name,
    role: users.role,
    stationId: users.stationId,
    areaManagerId: users.areaManagerId,
    createdAt: users.createdAt,
  });

  return newUser;
};

export const loginUser = async (name: string, password: string) => {
  const user = await db.query.users.findFirst({
    where: eq(users.name, name),
  });

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const isValid = await comparePassword(password, user.password);

  if (!isValid) {
    throw new Error('Invalid credentials');
  }

  const token = generateToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      employeeId: user.employeeId,
      name: user.name,
      role: user.role,
      stationId: user.stationId,
      areaManagerId: user.areaManagerId,
    },
  };
};

export const getUserById = async (userId: string) => {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      employeeId: true,
      name: true,
      role: true,
      stationId: true,
      areaManagerId: true,
      createdAt: true,
    },
  });
};
