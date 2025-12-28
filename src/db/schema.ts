import { pgTable, uuid, text, timestamp, doublePrecision, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- Enums ---
export const userRoleEnum = pgEnum('UserRole', ['SM', 'AM', 'Admin']);
export const shiftTypeEnum = pgEnum('ShiftType', ['DAY', 'NIGHT']);
export const shiftStatusEnum = pgEnum('ShiftStatus', ['OPEN', 'CLOSED', 'LOCKED']);
export const cashTransferStatusEnum = pgEnum('CashTransferStatus', ['PENDING_ACCEPTANCE', 'WITH_AM', 'DEPOSITED']);

// --- Tables ---

export const stations = pgTable('stations', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    // removed .references() to avoid circular dependency in TS. FK is enforced by SQL.
    areaManagerId: uuid('area_manager_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    employeeId: text('employee_id').notNull().unique(),
    password: text('password').notNull(),
    name: text('name').notNull(),
    role: userRoleEnum('role').notNull(),
    stationId: uuid('station_id').references(() => stations.id, { onDelete: 'set null' }),
    areaId: text('area_id'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const tanks = pgTable('tanks', {
    id: uuid('id').defaultRandom().primaryKey(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    fuelType: text('fuel_type').notNull(),
    capacity: doublePrecision('capacity').notNull(),
    currentLevel: doublePrecision('current_level').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const nozzles = pgTable('nozzles', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    tankId: uuid('tank_id').notNull().references(() => tanks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const shifts = pgTable('shifts', {
    id: uuid('id').defaultRandom().primaryKey(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    shiftType: shiftTypeEnum('shift_type').notNull(),
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time'),
    status: shiftStatusEnum('status').default('OPEN'),
    locked: boolean('locked').default(false),
    lockedBy: text('locked_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const shiftReadings = pgTable('shift_readings', {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
    nozzleId: uuid('nozzle_id').notNull().references(() => nozzles.id, { onDelete: 'cascade' }),
    openingReading: doublePrecision('opening_reading').notNull(),
    closingReading: doublePrecision('closing_reading'),
    consumption: doublePrecision('consumption'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cashTransactions = pgTable('cash_transactions', {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    litersSold: doublePrecision('liters_sold').notNull(),
    ratePerLiter: doublePrecision('rate_per_liter').notNull(),
    totalRevenue: doublePrecision('total_revenue').notNull(),
    cardPayments: doublePrecision('card_payments').default(0),
    cashOnHand: doublePrecision('cash_on_hand').notNull(),
    bankDeposit: doublePrecision('bank_deposit').default(0),
    cashToAM: doublePrecision('cash_to_am').notNull(),
    status: cashTransferStatusEnum('status').default('PENDING_ACCEPTANCE'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const cashTransfers = pgTable('cash_transfers', {
    id: uuid('id').defaultRandom().primaryKey(),
    cashTransactionId: uuid('cash_transaction_id').notNull().references(() => cashTransactions.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    status: cashTransferStatusEnum('status').default('PENDING_ACCEPTANCE'),
    receiptUrl: text('receipt_url'),
    depositedAt: timestamp('deposited_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const tankerDeliveries = pgTable('tanker_deliveries', {
    id: uuid('id').defaultRandom().primaryKey(),
    tankId: uuid('tank_id').notNull().references(() => tanks.id, { onDelete: 'cascade' }),
    liters: doublePrecision('liters').notNull(),
    deliveryDate: timestamp('delivery_date').defaultNow(),
    recordedBy: uuid('recorded_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Relations ---

export const stationsRelations = relations(stations, ({ one, many }) => ({
    users: many(users, { relationName: 'stationUsers' }), // Users working at this station
    areaManager: one(users, {
        fields: [stations.areaManagerId],
        references: [users.id],
        relationName: 'areaManager'
    }),
    tanks: many(tanks),
    nozzles: many(nozzles),
    shifts: many(shifts),
    cashTransactions: many(cashTransactions),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
    station: one(stations, {
        fields: [users.stationId],
        references: [stations.id],
        relationName: 'stationUsers'
    }),
    managedStations: many(stations, { relationName: 'areaManager' }),
    // Add other relations if necessary, e.g. shifts locked by user, cash transfers, etc.
}));

export const tanksRelations = relations(tanks, ({ one, many }) => ({
    station: one(stations, { fields: [tanks.stationId], references: [stations.id] }),
    nozzles: many(nozzles),
    tankerDeliveries: many(tankerDeliveries),
}));

export const nozzlesRelations = relations(nozzles, ({ one, many }) => ({
    station: one(stations, { fields: [nozzles.stationId], references: [stations.id] }),
    tank: one(tanks, { fields: [nozzles.tankId], references: [tanks.id] }),
    shiftReadings: many(shiftReadings),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
    station: one(stations, { fields: [shifts.stationId], references: [stations.id] }),
    shiftReadings: many(shiftReadings),
    cashTransactions: many(cashTransactions),
}));

export const shiftReadingsRelations = relations(shiftReadings, ({ one }) => ({
    shift: one(shifts, { fields: [shiftReadings.shiftId], references: [shifts.id] }),
    nozzle: one(nozzles, { fields: [shiftReadings.nozzleId], references: [nozzles.id] }),
}));

export const cashTransactionsRelations = relations(cashTransactions, ({ one }) => ({
    station: one(stations, { fields: [cashTransactions.stationId], references: [stations.id] }),
    shift: one(shifts, { fields: [cashTransactions.shiftId], references: [shifts.id] }),
    cashTransfer: one(cashTransfers),
}));

export const cashTransfersRelations = relations(cashTransfers, ({ one }) => ({
    cashTransaction: one(cashTransactions, { fields: [cashTransfers.cashTransactionId], references: [cashTransactions.id] }),
    fromUser: one(users, { fields: [cashTransfers.fromUserId], references: [users.id] }),
    toUser: one(users, { fields: [cashTransfers.toUserId], references: [users.id] }),
}));

export const tankerDeliveriesRelations = relations(tankerDeliveries, ({ one }) => ({
    tank: one(tanks, { fields: [tankerDeliveries.tankId], references: [tanks.id] }),
    recordedBy: one(users, { fields: [tankerDeliveries.recordedBy], references: [users.id] }),
}));

// Export type helpers if needed
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
