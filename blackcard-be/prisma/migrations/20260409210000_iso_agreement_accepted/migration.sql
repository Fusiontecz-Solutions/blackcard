-- ISO portal: persist agreement acceptance timestamp on ISO
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "agreementAcceptedAt" TIMESTAMP(3);
