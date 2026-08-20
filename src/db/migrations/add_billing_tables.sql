-- Run this once manually to add the three missing tables.
-- The rest of the schema (users, groups, sessions, etc.) already exists.

-- Enums (IF NOT EXISTS guards against re-runs)
DO $$ BEGIN
  CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."billing_cycle" AS ENUM('weekly', 'monthly', 'yearly');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."subscription_status" AS ENUM('active', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transactions
CREATE TABLE IF NOT EXISTS "transactions" (
  "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id"       uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "initiated_by"   uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "tx_ref"         varchar(255) NOT NULL UNIQUE,
  "status"         "transaction_status" DEFAULT 'pending' NOT NULL,
  "plan_tier"      varchar(50) NOT NULL,
  "billing_cycle"  "billing_cycle" NOT NULL,
  "amount"         integer NOT NULL,
  "currency"       varchar(3) DEFAULT 'NGN' NOT NULL,
  "payment_method" varchar(50),
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "completed_at"   timestamp
);

-- Subscriptions (one row per group)
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id"            uuid NOT NULL UNIQUE REFERENCES "groups"("id") ON DELETE CASCADE,
  "plan_tier"           varchar(50) NOT NULL,
  "billing_cycle"       "billing_cycle" NOT NULL,
  "status"              "subscription_status" DEFAULT 'active' NOT NULL,
  "start_date"          timestamp NOT NULL,
  "end_date"            timestamp,
  "next_renewal_date"   timestamp,
  "last_transaction_id" uuid REFERENCES "transactions"("id") ON DELETE SET NULL,
  "created_at"          timestamp DEFAULT now() NOT NULL,
  "updated_at"          timestamp DEFAULT now() NOT NULL
);

-- Group invite links
CREATE TABLE IF NOT EXISTS "group_invite_links" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "group_id"   uuid NOT NULL REFERENCES "groups"("id") ON DELETE CASCADE,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token"      varchar(64) NOT NULL UNIQUE,
  "max_uses"   integer,
  "use_count"  integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp,
  "is_active"  boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
