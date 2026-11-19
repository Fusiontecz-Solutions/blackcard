-- ISO portal: store uploaded document metadata per ISO
ALTER TABLE "Iso" ADD COLUMN IF NOT EXISTS "documents" JSONB NOT NULL DEFAULT '[]'::jsonb;
