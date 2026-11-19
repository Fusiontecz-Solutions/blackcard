-- Add excluded-state rules for funders (e.g. hide a funder in Texas only).
ALTER TABLE "FunderProfile" ADD COLUMN IF NOT EXISTS "excludedStates" JSONB;
