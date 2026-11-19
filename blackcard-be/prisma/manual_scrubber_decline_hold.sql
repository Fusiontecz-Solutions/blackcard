-- One-time: scrubber Recommend Declines made before the "Decline by Scrubber" hold
-- still sit in the Underwriter queue. Move them to Super Admin's Declined by Scrubber
-- bucket (no mail is sent). Run the SELECT first to review the rows.

SELECT "applicationId", "currentQueue", "scrubberRecommendation", "assignedUnderwriterId"
FROM "Application"
WHERE "scrubberRecommendation" ILIKE 'Recommend Decline%'
  AND "currentQueue" = 'Underwriter'
  AND "underwriterAction" IS NULL
  AND "deletedAt" IS NULL;

UPDATE "Application"
SET "currentQueue" = 'Declined',
    "currentState" = 'CANCELLED',
    "underwriterAction" = 'Decline by Scrubber'
WHERE "scrubberRecommendation" ILIKE 'Recommend Decline%'
  AND "currentQueue" = 'Underwriter'
  AND "underwriterAction" IS NULL
  AND "deletedAt" IS NULL;
