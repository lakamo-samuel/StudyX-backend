import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env'

const isNeon = env.DATABASE_URL.includes('neon.tech') || env.DATABASE_URL.includes('sslmode=require');
const isProduction = env.NODE_ENV === "production" || isNeon;

const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false, 
})

export const db = drizzle(pool);
