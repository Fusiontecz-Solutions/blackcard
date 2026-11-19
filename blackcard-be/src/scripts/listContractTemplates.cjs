require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Client } = require('pg');

async function main() {
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();
  try {
    const templates = await pg.query(`
      SELECT id, "originalName", url, "createdAt"
      FROM "ContractTemplate"
      ORDER BY "createdAt" DESC
      LIMIT 20
    `);
    const bold = await pg.query(`
      SELECT id, name, type, "layoutKey", "originalFileName", "templateId"
      FROM "BoldSignTemplate"
      ORDER BY "createdAt" DESC
      LIMIT 50
    `);
    const funders = await pg.query(`
      SELECT name, "displayName", "contractPdfFileName", "dealIdPrefix"
      FROM "FunderProfile"
    `);
    console.log('ContractTemplate', JSON.stringify(templates.rows, null, 2));
    console.log('BoldSignTemplate', JSON.stringify(bold.rows, null, 2));
    console.log('FunderProfile', JSON.stringify(funders.rows, null, 2));
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
