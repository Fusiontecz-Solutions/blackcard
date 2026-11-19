-- Notification triage fields: per-user importance, action buckets, MCA category,
-- snooze, archive, and deep-link. Additive only; existing rows pick up defaults.
ALTER TABLE "Notification"
  ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS "bucket" TEXT NOT NULL DEFAULT 'inbox',
  ADD COLUMN IF NOT EXISTS "importance" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "actionUrl" TEXT;

CREATE INDEX IF NOT EXISTS "Notification_recipientId_bucket_idx" ON "Notification"("recipientId", "bucket");
CREATE INDEX IF NOT EXISTS "Notification_recipientId_importance_idx" ON "Notification"("recipientId", "importance");
CREATE INDEX IF NOT EXISTS "Notification_recipientId_category_idx" ON "Notification"("recipientId", "category");

-- Backfill MCA category for pre-existing rows (mirrors deriveCategory in notificationCategory.ts).
-- Categories: approvals | contracts | funding | collections | others.
UPDATE "Notification" SET "category" = CASE
  WHEN "type" ILIKE '%contract%' THEN 'contracts'
  WHEN "type" ILIKE '%fund%' OR "type" ILIKE '%disburs%' THEN 'funding'
  WHEN "type" ILIKE '%payment%' OR "type" ILIKE '%ach%' OR "type" ILIKE '%collection%' OR "type" ILIKE '%repayment%' THEN 'collections'
  WHEN "type" ILIKE '%application%' OR "type" ILIKE '%underwrit%' OR "type" ILIKE '%approv%' OR "type" ILIKE '%document%' OR "type" ILIKE '%stip%' OR "type" = 'attachment' THEN 'approvals'
  ELSE 'others'
END
WHERE "category" = 'system';
