-- Position funding/close dates are optional: blank stays empty instead of defaulting to today.
ALTER TABLE "Position" ALTER COLUMN "fundingDate" DROP NOT NULL,
ALTER COLUMN "closeDate" DROP NOT NULL;
