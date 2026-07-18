/**
 * Targeted migration script — adds only the new columns introduced in the AI upgrade.
 * Uses IF NOT EXISTS so it's safe to run multiple times.
 * Reads DATABASE_URL from .env
 */
import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  // Phase 3 — session AI summary
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_summary text`,

  // Phase 4 — AI chat history stored server-side
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai_chat boolean DEFAULT false NOT NULL`,
  `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_ai_response boolean DEFAULT false NOT NULL`,
];

async function run() {
  const client = await pool.connect();
  try {
    console.log("🔧 Applying AI upgrade columns...");
    for (const sql of statements) {
      console.log(`  → ${sql}`);
      await client.query(sql);
    }
    console.log("✅ All columns applied successfully. Backend is ready.");
  } catch (err: any) {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
