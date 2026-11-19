-- Remap legacy Role enum value before Prisma can drop SCRUBBING from Role.
-- Safe to run multiple times (no-op when no SCRUBBING rows remain).

UPDATE "User"
SET role = 'UNDERWRITER'::"Role"
WHERE role::text = 'SCRUBBING';
