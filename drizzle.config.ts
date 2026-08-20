import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
dotenv.config();

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:chronovah@localhost:5433/vyrd';
const isNeon = dbUrl.includes('neon.tech') || dbUrl.includes('sslmode=require');
const isProduction = process.env.NODE_ENV === 'production' || isNeon;

export default defineConfig({
  schema: './src/db/schema/*',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: dbUrl,
    ...(isProduction ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});

