-- Index for deal id lookups on GET /collection-payments and related paths (avoids full table scans on equality filters).
CREATE INDEX IF NOT EXISTS "Application_dealId_idx" ON "Application"("dealId");
