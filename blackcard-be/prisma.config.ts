import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import dotenv from 'dotenv';
dotenv.config();

// Use a placeholder when DATABASE_URL is not set (e.g. during Render/CI build).
// prisma generate does not connect to the DB; runtime uses real DATABASE_URL via prismaClient.
const databaseUrl =
  process.env.DATABASE_URL ||
  'postgresql://build:build@localhost:5432/build?schema=public';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});