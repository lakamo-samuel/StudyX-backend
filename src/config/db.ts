import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from './env'

const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Neon (and most managed Postgres) requires SSL in production
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

export const db = drizzle(pool);