import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const roles = await pool.query<{ role_value: string }>(
    `SELECT unnest(enum_range(NULL::"Role"))::text AS role_value ORDER BY 1`,
  );
  const users = await pool.query<{ role: string; cnt: string }>(
    `SELECT role::text AS role, COUNT(*)::int AS cnt
     FROM "User"
     WHERE role::text IN ('UNDERWRITER', 'SCRUBBING')
     GROUP BY role::text
     ORDER BY role::text`,
  );
  console.log('Enum values:', roles.rows.map((r) => r.role_value));
  console.log('User counts:', users.rows);
}

main()
  .catch(console.error)
  .finally(() => pool.end());
