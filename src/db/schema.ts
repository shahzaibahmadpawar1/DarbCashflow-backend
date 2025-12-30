import { pgTable, uuid, text, timestamp, doublePrecision, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- Enums ---
export const userRoleEnum = pgEnum('UserRole', ['SM', 'AM', 'Admin']);
export const shiftTypeEnum = pgEnum('ShiftType', ['DAY', 'NIGHT']);
export const shiftStatusEnum = pgEnum('ShiftStatus', ['OPEN', 'CLOSED', 'LOCKED']);
export const cashTransferStatusEnum = pgEnum('CashTransferStatus', ['PENDING_ACCEPTANCE', 'WITH_AM', 'DEPOSITED']);
export const fuelTypeEnum = pgEnum('FuelType', ['91_GASOLINE', '95_GASOLINE', 'DIESEL']);

// --- Tables ---

export const stations = pgTable('stations', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
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
    areaManagerId: uuid('area_manager_id'), // Self-reference to users.id (SM -> AM)
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const tanks = pgTable('tanks', {
    id: uuid('id').defaultRandom().primaryKey(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    capacity: doublePrecision('capacity'), // Nullable - will be set later
    currentLevel: doublePrecision('current_level').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const nozzles = pgTable('nozzles', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull().unique(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    tankId: uuid('tank_id').notNull().references(() => tanks.id, { onDelete: 'cascade' }),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    meterLimit: doublePrecision('meter_limit').default(999999),
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
    lockedAt: timestamp('locked_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const nozzleReadings = pgTable('nozzle_readings', {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
    nozzleId: uuid('nozzle_id').notNull().references(() => nozzles.id, { onDelete: 'cascade' }),
    openingReading: doublePrecision('opening_reading').notNull(),
    closingReading: doublePrecision('closing_reading'),
    consumption: doublePrecision('consumption'),
    isRollover: boolean('is_rollover').default(false),
    pricePerLiter: doublePrecision('price_per_liter'),
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
    litersDelivered: doublePrecision('liters_delivered').notNull(),
    deliveryDate: timestamp('delivery_date').notNull(),
    deliveredBy: uuid('delivered_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
    aramcoTicket: text('aramco_ticket'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Fuel Prices (Admin-managed)
export const fuelPrices = pgTable('fuel_prices', {
    id: uuid('id').defaultRandom().primaryKey(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    pricePerLiter: doublePrecision('price_per_liter').notNull(),
    effectiveFrom: timestamp('effective_from').notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Nozzle Sales (Station Manager input)
export const nozzleSales = pgTable('nozzle_sales', {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
    nozzleId: uuid('nozzle_id').notNull().references(() => nozzles.id, { onDelete: 'cascade' }),
    quantityLiters: doublePrecision('quantity_liters').notNull().default(0),
    pricePerLiter: doublePrecision('price_per_liter').notNull(),
    // totalAmount is auto-calculated in DB as generated column
    cardAmount: doublePrecision('card_amount').default(0),
    cashAmount: doublePrecision('cash_amount').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// --- Relations ---

export const stationsRelations = relations(stations, ({ one, many }) => ({
    users: many(users, { relationName: 'stationUsers' }), // Station Managers assigned to this station
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
    // SM -> AM relationship
    areaManager: one(users, {
        fields: [users.areaManagerId],
        references: [users.id],
        relationName: 'areaManagerRelation'
    }),
    // AM -> SMs relationship
    subordinates: many(users, { relationName: 'areaManagerRelation' }),
}));

export const tanksRelations = relations(tanks, ({ one, many }) => ({
    station: one(stations, { fields: [tanks.stationId], references: [stations.id] }),
    nozzles: many(nozzles),
    tankerDeliveries: many(tankerDeliveries),
}));

export const nozzlesRelations = relations(nozzles, ({ one, many }) => ({
    station: one(stations, { fields: [nozzles.stationId], references: [stations.id] }),
    tank: one(tanks, { fields: [nozzles.tankId], references: [tanks.id] }),
    nozzleReadings: many(nozzleReadings),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
    station: one(stations, { fields: [shifts.stationId], references: [stations.id] }),
    nozzleReadings: many(nozzleReadings),
    cashTransactions: many(cashTransactions),
}));

export const nozzleReadingsRelations = relations(nozzleReadings, ({ one }) => ({
    shift: one(shifts, { fields: [nozzleReadings.shiftId], references: [shifts.id] }),
    nozzle: one(nozzles, { fields: [nozzleReadings.nozzleId], references: [nozzles.id] }),
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
    deliveredBy: one(users, { fields: [tankerDeliveries.deliveredBy], references: [users.id] }),
}));

export const fuelPricesRelations = relations(fuelPrices, ({ one }) => ({
    station: one(stations, { fields: [fuelPrices.stationId], references: [stations.id] }),
    createdByUser: one(users, { fields: [fuelPrices.createdBy], references: [users.id] }),
}));

export const nozzleSalesRelations = relations(nozzleSales, ({ one }) => ({
    shift: one(shifts, { fields: [nozzleSales.shiftId], references: [shifts.id] }),
    nozzle: one(nozzles, { fields: [nozzleSales.nozzleId], references: [nozzles.id] }),
}));

// Export type helpers if needed
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
