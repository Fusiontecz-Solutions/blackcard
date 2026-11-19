-- Persist Decision Logic request code on invitation token so page reloads after bank OAuth reuse the same session.
ALTER TABLE "DecisionLogicToken" ADD COLUMN IF NOT EXISTS "requestCode" TEXT;
