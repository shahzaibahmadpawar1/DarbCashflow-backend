CREATE TYPE "public"."CashTransferStatus" AS ENUM('PENDING_ACCEPTANCE', 'WITH_AM', 'DEPOSITED');--> statement-breakpoint
CREATE TYPE "public"."ShiftStatus" AS ENUM('OPEN', 'CLOSED', 'LOCKED');--> statement-breakpoint
CREATE TYPE "public"."ShiftType" AS ENUM('DAY', 'NIGHT');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('SM', 'AM', 'Admin');--> statement-breakpoint
CREATE TABLE "cash_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"liters_sold" double precision NOT NULL,
	"rate_per_liter" double precision NOT NULL,
	"total_revenue" double precision NOT NULL,
	"card_payments" double precision DEFAULT 0,
	"cash_on_hand" double precision NOT NULL,
	"bank_deposit" double precision DEFAULT 0,
	"cash_to_am" double precision NOT NULL,
	"status" "CashTransferStatus" DEFAULT 'PENDING_ACCEPTANCE',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cash_transaction_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_user_id" uuid NOT NULL,
	"status" "CashTransferStatus" DEFAULT 'PENDING_ACCEPTANCE',
	"receipt_url" text,
	"deposited_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "nozzles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"station_id" uuid NOT NULL,
	"tank_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nozzles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shift_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"nozzle_id" uuid NOT NULL,
	"opening_reading" double precision NOT NULL,
	"closing_reading" double precision,
	"consumption" double precision,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"shift_type" "ShiftType" NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"status" "ShiftStatus" DEFAULT 'OPEN',
	"locked" boolean DEFAULT false,
	"locked_by" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"area_manager_id" uuid,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tanker_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tank_id" uuid NOT NULL,
	"liters" double precision NOT NULL,
	"delivery_date" timestamp DEFAULT now(),
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tanks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"fuel_type" text NOT NULL,
	"capacity" double precision NOT NULL,
	"current_level" double precision DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"role" "UserRole" NOT NULL,
	"station_id" uuid,
	"area_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_cash_transaction_id_cash_transactions_id_fk" FOREIGN KEY ("cash_transaction_id") REFERENCES "public"."cash_transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nozzles" ADD CONSTRAINT "nozzles_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_readings" ADD CONSTRAINT "shift_readings_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_readings" ADD CONSTRAINT "shift_readings_nozzle_id_nozzles_id_fk" FOREIGN KEY ("nozzle_id") REFERENCES "public"."nozzles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanker_deliveries" ADD CONSTRAINT "tanker_deliveries_tank_id_tanks_id_fk" FOREIGN KEY ("tank_id") REFERENCES "public"."tanks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanker_deliveries" ADD CONSTRAINT "tanker_deliveries_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tanks" ADD CONSTRAINT "tanks_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;