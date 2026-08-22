-- Add recurring billing fields to subscriptions table
ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "flw_plan_id"          varchar(50),
  ADD COLUMN IF NOT EXISTS "flw_subscription_id"  varchar(100),
  ADD COLUMN IF NOT EXISTS "is_recurring"         boolean DEFAULT false NOT NULL;
