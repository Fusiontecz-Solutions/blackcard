-- Add credit/debit status values so payment schedule can persist these options.
ALTER TYPE "CollectionPaymentStatus" ADD VALUE IF NOT EXISTS 'CREDIT';
ALTER TYPE "CollectionPaymentStatus" ADD VALUE IF NOT EXISTS 'DEBIT';
