require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const EMAIL = 'dev@blackcardfunding.com';
const PASSWORD = 'Admin@123';
const FIRST_NAME = 'Dev';
const LAST_NAME = 'Admin';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set in .env');
  }

  const hashedPassword = await bcrypt.hash(PASSWORD, 10);
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    const existing = await client.query(
      `SELECT id, email, role FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
      [EMAIL],
    );

    if (existing.rows.length) {
      const row = existing.rows[0];
      await client.query(
        `UPDATE "User"
         SET "firstName" = $1,
             "lastName" = $2,
             email = $3,
             password = $4,
             role = 'SUPER_ADMIN'::"Role",
             "isActive" = true,
             "isVerified" = true,
             "updatedAt" = NOW()
         WHERE id = $5`,
        [FIRST_NAME, LAST_NAME, EMAIL, hashedPassword, row.id],
      );
      console.log(`Updated SUPER_ADMIN: ${EMAIL} (${row.id})`);
      return;
    }

    const created = await client.query(
      `INSERT INTO "User" (
         id, "firstName", "lastName", email, password, role,
         "isActive", "isVerified", otp, "otpExpiry", "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, 'SUPER_ADMIN'::"Role",
         true, true, 0, 0, NOW(), NOW()
       )
       RETURNING id, email, role`,
      [FIRST_NAME, LAST_NAME, EMAIL, hashedPassword],
    );
    const user = created.rows[0];
    console.log(`Created SUPER_ADMIN: ${user.email} (${user.id})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
