import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;

// Disable prefetch as it is not supported for "Transaction" pooler mode
const client = postgres(connectionString, { prepare: false });
const db = drizzle(client, { schema });

export default db;