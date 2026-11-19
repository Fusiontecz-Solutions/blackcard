/**
 * Google Sheet / .xlsx → CRM sync for blackcard.
 *
 *   npx ts-node src/scripts/sheetSync.ts --env .env.sync-test --file "C:\path\Blackcard.xlsx"
 *   npx ts-node src/scripts/sheetSync.ts --env .env.sync-test --google <spreadsheetId>
 *
 * Without --apply it is a dry run: the plan is built inside a READ ONLY database transaction,
 * so nothing can be written, and the full report is saved as JSON.
 *
 * --apply --actor <userId> writes the plan. It only runs when SHEET_SYNC_ALLOW_WRITE_HOST equals
 * the database host in DATABASE_URL, so pointing the script at the wrong database by mistake
 * cannot change it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import dotenv from 'dotenv';

function arg(name: string): string | undefined {
    const i = process.argv.indexOf(`--${name}`);
    return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

// Load the chosen env file before anything imports the Prisma client.
const envFile = arg('env');
if (envFile) dotenv.config({ path: path.resolve(envFile), override: true });

async function main(): Promise<void> {
    const { default: prisma } = await import('../config/prismaClient');
    const { BLACKCARD_SHEET_SYNC_CONFIG: config } = await import('../services/sheetSync/sheetSyncConfig');
    const { readSheetTabs } = await import('../services/sheetSync/sheetSource');
    const { planSheetSync, applySheetSync } = await import('../services/sheetSync/sheetSyncService');

    const file = arg('file');
    const spreadsheetId = arg('google');
    const linkId = arg('link');
    if ([file, spreadsheetId, linkId].filter(Boolean).length !== 1) {
        throw new Error('Pass exactly one of --file <path.xlsx>, --google <spreadsheetId> or --link <spreadsheetId>.');
    }
    const apply = flag('apply');

    const dbHost = new URL(process.env.DATABASE_URL ?? '').hostname;
    console.log(`Database host: ${dbHost}`);
    console.log(`Mode: ${apply ? 'APPLY (writes)' : 'dry run (read-only)'}`);

    const actorUserId = arg('actor');
    if (apply) {
        if (process.env.SHEET_SYNC_ALLOW_WRITE_HOST !== dbHost) {
            throw new Error(`Refusing to write: set SHEET_SYNC_ALLOW_WRITE_HOST=${dbHost} in the env file to allow writes to this database.`);
        }
        if (!actorUserId) throw new Error('--apply needs --actor <userId> (recorded as creator of new deals).');
    }

    const tabs = await readSheetTabs(
        file ? { kind: 'file', path: file } : linkId ? { kind: 'link', spreadsheetId: linkId } : { kind: 'google', spreadsheetId: spreadsheetId! },
        [config.dealsTab, config.paymentsTab],
    );

    const plan = await prisma.$transaction(
        async (tx) => {
            await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
            return planSheetSync(tx, tabs, config);
        },
        { maxWait: 90_000, timeout: 600_000 },
    );

    const outDir = arg('out') ?? path.join(os.tmpdir(), 'sheet-sync');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = plan.generatedAt.replace(/[:.]/g, '-');
    const planFile = path.join(outDir, `blackcard-plan-${stamp}.json`);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2));

    const p = plan.payments;
    const addTotal = p.toAdd.reduce((s, x) => s + x.amount, 0);
    console.log('\nDeals:', plan.dealCounts);
    console.log(`Payments: ${p.sheetRows} sheet rows | already in CRM ${p.alreadyInCrm} | to add ${p.toAdd.length} ($${addTotal.toFixed(2)}) | unmatched ${p.unmatched.length}`);
    console.log('Syndicator columns:', plan.syndicators.mapped);
    if (plan.syndicators.unknown.length) console.log('Syndicator columns held (no CRM syndicator):', plan.syndicators.unknown);
    console.log(`Deals getting syndicators filled: ${plan.syndicators.filledDeals} | different split kept: ${plan.syndicators.differentSplitDeals.length}`);
    for (const note of plan.notes) console.log('Note:', note);
    console.log(`\nFull plan: ${planFile}`);

    if (!apply) {
        await prisma.$disconnect();
        return;
    }

    const result = await applySheetSync(plan, actorUserId!);
    const resultFile = path.join(outDir, `blackcard-result-${stamp}.json`);
    fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    console.log('\nApplied:', {
        dealsCreated: result.deals?.successCount ?? 0,
        dealsUpdated: result.deals?.updatedCount ?? 0,
        dealErrors: result.deals?.failedCount ?? 0,
        dealIdsSet: result.dealIdsSet,
        paymentsAdded: result.paymentsAdded,
        paymentsSkippedAsDuplicate: result.paymentsSkippedAsDuplicate,
        paymentErrors: result.paymentErrors.length,
    });
    console.log(`Result: ${resultFile}`);
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
