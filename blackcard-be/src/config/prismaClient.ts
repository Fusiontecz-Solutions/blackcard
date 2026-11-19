import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Reuse a single PrismaClient instance across the app.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

// Use the standard PostgreSQL driver (pg) against the Neon connection string.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  // Prevent "ConnectionClosed" (P1017) when DB closes idle connections
  keepAlive: true,
  idleTimeoutMillis: 20000,
  // Neon cold starts can exceed 10s; allow longer connect attempts locally.
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS ?? '60000'),
});

pool.on('error', (err) => {
  console.error('Database pool error:', err.message);
});

const adapter = new PrismaPg(pool);

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  } as any);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;


