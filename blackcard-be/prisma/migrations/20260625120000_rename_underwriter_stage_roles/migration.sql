-- Rename workflow stage + role: Underwriter -> Scrubbing, Final Underwriter -> Underwriter.
--
-- Order matters because the new "Underwriter" value reuses a name that previously
-- belonged to the first review stage. We free up the old name first, then reuse it.

-- 1) Role enum. ALTER TYPE ... RENAME VALUE relabels existing user rows in place.
--    Free up UNDERWRITER first, then promote FINAL_UNDERWRITER into it.
ALTER TYPE "Role" RENAME VALUE 'UNDERWRITER' TO 'SCRUBBING';
ALTER TYPE "Role" RENAME VALUE 'FINAL_UNDERWRITER' TO 'UNDERWRITER';

-- 2) Application workflow string columns (currentQueue / currentState).
--    Same safe order: first stage -> Scrubbing, then final stage -> Underwriter.
UPDATE "Application" SET "currentQueue" = 'Scrubbing'   WHERE "currentQueue" = 'Underwriter';
UPDATE "Application" SET "currentQueue" = 'Underwriter' WHERE "currentQueue" = 'Final Underwriter';

UPDATE "Application" SET "currentState" = 'Scrubbing'   WHERE "currentState" = 'Underwriter';
UPDATE "Application" SET "currentState" = 'Underwriter' WHERE "currentState" = 'Final Underwriter';
