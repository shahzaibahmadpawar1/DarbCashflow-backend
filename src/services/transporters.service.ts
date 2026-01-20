import db from '../config/database';
import { transporters } from '../db/schema';
import { eq } from 'drizzle-orm';

// Create transporter
export const createTransporter = async (data: {
    name: string;
    defaultCost: number;
}) => {
    return db.insert(transporters).values({
        name: data.name,
        defaultCost: data.defaultCost,
        isActive: true,
    }).returning();
};

// Update transporter
export const updateTransporter = async (
    id: string,
    data: {
        name?: string;
        defaultCost?: number;
        isActive?: boolean;
    }
) => {
    return db.update(transporters)
        .set({
            ...data,
            updatedAt: new Date(),
        })
        .where(eq(transporters.id, id))
        .returning();
};

// Get all transporters
export const getAllTransporters = async () => {
    return db.query.transporters.findMany({
        orderBy: (transporters, { asc }) => [asc(transporters.name)],
    });
};

// Get active transporters only
export const getActiveTransporters = async () => {
    return db.query.transporters.findMany({
        where: eq(transporters.isActive, true),
        orderBy: (transporters, { asc }) => [asc(transporters.name)],
    });
};

// Get transporter by ID
export const getTransporterById = async (id: string) => {
    return db.query.transporters.findFirst({
        where: eq(transporters.id, id),
    });
};

// Toggle transporter status
export const toggleTransporterStatus = async (id: string) => {
    const transporter = await getTransporterById(id);

    if (!transporter) {
        throw new Error('Transporter not found');
    }

    return db.update(transporters)
        .set({
            isActive: !transporter.isActive,
            updatedAt: new Date(),
        })
        .where(eq(transporters.id, id))
        .returning();
};
