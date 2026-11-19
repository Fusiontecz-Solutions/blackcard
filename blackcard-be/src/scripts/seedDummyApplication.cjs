require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

async function main() {
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const userRes = await pg.query(
      `SELECT id FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
      ['dev@blackcardfunding.com'],
    );
    const salesRepId = userRes.rows[0]?.id;
    if (!salesRepId) {
      throw new Error('SUPER_ADMIN user dev@blackcardfunding.com not found');
    }

    const clientRes = await pg.query(
      `INSERT INTO "Client" (
         id, "businessName", "businessEmail", "businessNumber",
         "businessCity", "businessState", "businessZipCode", "businessAddress1",
         "ownerFirstName", "ownerLastName", "ownerEmail", "ownerMobileNumber",
         status, "createdById", "assignedToId", "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, $2, $3,
         $4, $5, $6, $7,
         $8, $9, $10, $11,
         'Pending', $12, $12, NOW(), NOW()
       )
       RETURNING id, "clientId", "businessName"`,
      [
        'Black Card Dummy LLC',
        'dummy@blackcard.com',
        '5551234567',
        'New York',
        'NY',
        '10001',
        '100 Dummy Street',
        'Alex',
        'Merchant',
        'alex.merchant@example.com',
        '5559876543',
        salesRepId,
      ],
    );
    const client = clientRes.rows[0];

    await pg.query(
      `INSERT INTO "ClientOwner" (
         id, "clientId", "sortOrder", "firstName", "lastName", email, "mobileNumber",
         "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), $1, 0, $2, $3, $4, $5, NOW(), NOW()
       )`,
      [client.id, 'Alex', 'Merchant', 'alex.merchant@example.com', '5559876543'],
    );

    const dealRes = await pg.query(`
      SELECT COALESCE(
        MAX((regexp_match(upper("dealId"), '^BCF([0-9]+)$'))[1]::integer),
        0
      ) AS max_num
      FROM "Application"
      WHERE "dealId" IS NOT NULL
    `);
    const nextDeal = `BCF${Number(dealRes.rows[0].max_num || 0) + 1}`;

    const appRes = await pg.query(
      `INSERT INTO "Application" (
         id, priority, type, "salesRepresentativeId", "clientId", "createdById",
         "loanAmount", note, "currentQueue", "currentState", "dealId",
         "createdAt", "updatedAt"
       ) VALUES (
         gen_random_uuid(), 'Medium', 'New', $1, $2, $1,
         50000, 'Dummy application for testing', 'New', 'Draft', $3,
         NOW(), NOW()
       )
       RETURNING id, "applicationId", "dealId", "currentQueue", "currentState"`,
      [salesRepId, client.id, nextDeal],
    );
    const app = appRes.rows[0];

    console.log(
      JSON.stringify(
        {
          applicationId: app.applicationId,
          dealId: app.dealId,
          uuid: app.id,
          queue: app.currentQueue,
          state: app.currentState,
          client: client.businessName,
          clientId: client.clientId,
        },
        null,
        2,
      ),
    );
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
