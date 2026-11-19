-- Remap legacy first-review queue to Scrubbing (Gmail auto-scrub / UW rename).
-- Safe order: free "Underwriter" first, then promote final stage into it.

UPDATE "Application"
SET "currentQueue" = 'Scrubbing'
WHERE "currentQueue" IN ('Underwriter', 'Underwriting');

UPDATE "Application"
SET "currentQueue" = 'Underwriter'
WHERE "currentQueue" IN ('Final Underwriter', 'Final Review');

UPDATE "Application"
SET "currentState" = 'Scrubbing'
WHERE "currentState" IN ('Underwriter', 'Underwriting');

UPDATE "Application"
SET "currentState" = 'Underwriter'
WHERE "currentState" IN ('Final Underwriter', 'Final Review');
