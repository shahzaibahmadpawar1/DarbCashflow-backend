import { pgTable, uuid, text, timestamp, doublePrecision, boolean, pgEnum, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- Enums ---
export const userRoleEnum = pgEnum('UserRole', ['SM', 'AM', 'Admin', 'OU']);
export const shiftTypeEnum = pgEnum('ShiftType', ['DAY', 'NIGHT']);
export const shiftStatusEnum = pgEnum('ShiftStatus', ['OPEN', 'SAVED', 'CLOSED', 'LOCKED']);
export const cashTransferStatusEnum = pgEnum('CashTransferStatus', ['PENDING_ACCEPTANCE', 'WITH_AM', 'DEPOSITED']);
export const fuelTypeEnum = pgEnum('FuelType', ['91_GASOLINE', '95_GASOLINE', 'DIESEL']);
export const stationTypeEnum = pgEnum('StationType', ['OPERATIONAL', 'RENTAL', 'FRANCHISE']);

// --- Tables ---

export const stations = pgTable('stations', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    stationType: stationTypeEnum('station_type').default('OPERATIONAL'),
    purchaseCredits: doublePrecision('purchase_credits').default(0).notNull(),
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
    openingReading: doublePrecision('opening_reading').default(0),
    displayOrder: integer('display_order').default(0), // For maintaining nozzle sequence
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const shifts = pgTable('shifts', {
    id: uuid('id').defaultRandom().primaryKey(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    shiftType: shiftTypeEnum('shift_type'), // Nullable for daily shifts
    shiftDate: timestamp('shift_date'), // Date for daily shifts
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
    option3Payments: doublePrecision('option3_payments').default(0),
    option4Payments: doublePrecision('option4_payments').default(0),
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
    acceptedAt: timestamp('accepted_at'),
    depositedAt: timestamp('deposited_at'),
    amountDeposited: doublePrecision('amount_deposited').default(0),
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
    receiptUrl: text('receipt_url'),
    isUnlocked: boolean('is_unlocked').default(false),
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

// Daily Shift Readings (for new daily shift system)
export const dailyShiftReadings = pgTable('daily_shift_readings', {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id').notNull().references(() => shifts.id, { onDelete: 'cascade' }),
    nozzleId: uuid('nozzle_id').notNull().references(() => nozzles.id, { onDelete: 'cascade' }),
    openingReading: doublePrecision('opening_reading').notNull(),
    shiftAReading: doublePrecision('shift_a_reading'),
    shiftBReading: doublePrecision('shift_b_reading'),
    shiftALiters: doublePrecision('shift_a_liters').default(0),
    shiftBLiters: doublePrecision('shift_b_liters').default(0),
    pricePerLiter: doublePrecision('price_per_liter').notNull(),
    shiftAAmount: doublePrecision('shift_a_amount').default(0),
    shiftBAmount: doublePrecision('shift_b_amount').default(0),
    totalAmount: doublePrecision('total_amount').default(0),
    shiftAPhotoUrl: text('shift_a_photo_url'),
    shiftBPhotoUrl: text('shift_b_photo_url'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Payment Summary (for daily shifts)
export const paymentSummary = pgTable('payment_summary', {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id').notNull().unique().references(() => shifts.id, { onDelete: 'cascade' }),
    cardAmount: doublePrecision('card_amount').default(0),
    cashAmount: doublePrecision('cash_amount').default(0),
    option3Amount: doublePrecision('option3_amount').default(0),
    option4Amount: doublePrecision('option4_amount').default(0),
    totalCollected: doublePrecision('total_collected').default(0),
    difference: doublePrecision('difference').default(0),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Bank Deposits (Area Manager -> Bank)
export const bankDeposits = pgTable('bank_deposits', {
    id: uuid('id').defaultRandom().primaryKey(),
    depositedBy: uuid('deposited_by').notNull().references(() => users.id),
    amount: doublePrecision('amount').notNull(),
    depositDate: timestamp('deposit_date').notNull(),
    receiptUrl: text('receipt_url'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

export const bankDepositItems = pgTable('bank_deposit_items', {
    id: uuid('id').defaultRandom().primaryKey(),
    bankDepositId: uuid('bank_deposit_id').notNull().references(() => bankDeposits.id, { onDelete: 'cascade' }),
    cashTransferId: uuid('cash_transfer_id').notNull().references(() => cashTransfers.id),
    amount: doublePrecision('amount').notNull(),
    createdAt: timestamp('created_at').defaultNow(),
});

// Office User Stations (Junction table for OU -> Stations many-to-many)
export const officeUserStations = pgTable('office_user_stations', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow(),
});

// Purchase Requests
export const purchaseRequests = pgTable('purchase_requests', {
    id: uuid('id').defaultRandom().primaryKey(),
    stationId: uuid('station_id').notNull().references(() => stations.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    fuelType: fuelTypeEnum('fuel_type').notNull(),
    quantityLiters: doublePrecision('quantity_liters').notNull(),
    paymentAmount: doublePrecision('payment_amount').notNull(),
    requestedDeliveryDate: timestamp('requested_delivery_date').notNull(),
    receiptUrl: text('receipt_url'),
    status: text('status').notNull().default('PENDING'), // PENDING, APPROVED, REJECTED, RECEIVED
    rejectionReason: text('rejection_reason'),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
});

// Purchase Orders
export const purchaseOrders = pgTable('purchase_orders', {
    id: uuid('id').defaultRandom().primaryKey(),
    purchaseRequestId: uuid('purchase_request_id').notNull().references(() => purchaseRequests.id, { onDelete: 'cascade' }),
    poNumber: text('po_number').notNull().unique(),
    expectedDeliveryDate: timestamp('expected_delivery_date').notNull(),
    actualDeliveryDate: timestamp('actual_delivery_date'),
    invoiceNumber: text('invoice_number'),
    invoiceUrl: text('invoice_url'),
    receivedBy: uuid('received_by').references(() => users.id),
    receivedAt: timestamp('received_at'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
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
    officeUserAssignments: many(officeUserStations), // Office Users assigned to this station
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
    // Office User -> Assigned Stations (many-to-many)
    assignedStations: many(officeUserStations),
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
    nozzleSales: many(nozzleSales),
    dailyShiftReadings: many(dailyShiftReadings),
}));

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
    station: one(stations, { fields: [shifts.stationId], references: [stations.id] }),
    nozzleReadings: many(nozzleReadings),
    nozzleSales: many(nozzleSales),
    cashTransactions: many(cashTransactions),
    dailyShiftReadings: many(dailyShiftReadings),
    paymentSummary: one(paymentSummary),
}));

export const nozzleReadingsRelations = relations(nozzleReadings, ({ one }) => ({
    shift: one(shifts, { fields: [nozzleReadings.shiftId], references: [shifts.id] }),
    nozzle: one(nozzles, { fields: [nozzleReadings.nozzleId], references: [nozzles.id] }),
}));

export const cashTransactionsRelations = relations(cashTransactions, ({ one }) => ({
    station: one(stations, { fields: [cashTransactions.stationId], references: [stations.id] }),
    shift: one(shifts, { fields: [cashTransactions.shiftId], references: [shifts.id] }),
    cashTransfer: one(cashTransfers, { fields: [cashTransactions.id], references: [cashTransfers.cashTransactionId] }),
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

export const dailyShiftReadingsRelations = relations(dailyShiftReadings, ({ one }) => ({
    shift: one(shifts, { fields: [dailyShiftReadings.shiftId], references: [shifts.id] }),
    nozzle: one(nozzles, { fields: [dailyShiftReadings.nozzleId], references: [nozzles.id] }),
}));

export const paymentSummaryRelations = relations(paymentSummary, ({ one }) => ({
    shift: one(shifts, { fields: [paymentSummary.shiftId], references: [shifts.id] }),
}));

export const bankDepositsRelations = relations(bankDeposits, ({ one, many }) => ({
    user: one(users, { fields: [bankDeposits.depositedBy], references: [users.id] }),
    items: many(bankDepositItems),
}));

export const bankDepositItemsRelations = relations(bankDepositItems, ({ one }) => ({
    deposit: one(bankDeposits, { fields: [bankDepositItems.bankDepositId], references: [bankDeposits.id] }),
    transfer: one(cashTransfers, { fields: [bankDepositItems.cashTransferId], references: [cashTransfers.id] }),
}));

export const officeUserStationsRelations = relations(officeUserStations, ({ one }) => ({
    user: one(users, { fields: [officeUserStations.userId], references: [users.id] }),
    station: one(stations, { fields: [officeUserStations.stationId], references: [stations.id] }),
}));

export const purchaseRequestsRelations = relations(purchaseRequests, ({ one }) => ({
    station: one(stations, { fields: [purchaseRequests.stationId], references: [stations.id] }),
    creator: one(users, { fields: [purchaseRequests.createdBy], references: [users.id] }),
    reviewer: one(users, { fields: [purchaseRequests.reviewedBy], references: [users.id] }),
    purchaseOrder: one(purchaseOrders, { fields: [purchaseRequests.id], references: [purchaseOrders.purchaseRequestId] }),
}));

export const purchaseOrdersRelations = relations(purchaseOrders, ({ one }) => ({
    purchaseRequest: one(purchaseRequests, { fields: [purchaseOrders.purchaseRequestId], references: [purchaseRequests.id] }),
    creator: one(users, { fields: [purchaseOrders.createdBy], references: [users.id] }),
    receiver: one(users, { fields: [purchaseOrders.receivedBy], references: [users.id] }),
}));

// Export type helpers if needed
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

