/**
 * Upsert the three payment letter templates shown under Payments -> Templates
 * from src/templates/payment-letters/.
 *
 * Bodies are brand-neutral: the company name, logo and contact address are
 * merge tokens ({{lender_name}}, {{brand_logo_url}}, {{contact_email}}) that
 * Letters resolves per book from the funder profile, so the same file is safe
 * in every book and a fork never inherits the previous book's branding.
 *
 * Usage: npx ts-node src/scripts/upsertPaymentLetterTemplates.ts
 */
import fs from 'fs';
import path from 'path';
import prisma from '../config/prismaClient';
import { PaymentTemplateType } from '@prisma/client';

const TEMPLATES_DIR = path.resolve(__dirname, '../templates/payment-letters');
const BRAND_LOGO_TOKEN = '{{brand_logo_url}}';

type LetterSeed = {
  /** Canonical name written to the row. */
  name: string;
  /** Earlier names for the same letter, so a re-run updates instead of duplicating. */
  aliases: string[];
  file: string;
  variables: string[];
};

const LETTER_SEEDS: LetterSeed[] = [
  {
    name: 'Payoff Letter',
    aliases: ['Payoff letter', 'Pay Off Letter', 'Payoff'],
    file: 'payoff-letter.html',
    variables: [
      'brand_logo_url',
      'lender_name',
      'contact_email',
      'letter_date',
      'account_name',
      'merchant_legal_name',
      'deal_id',
      'payoff_amount',
      'good_through_date',
      'payment_company_name',
      'payment_address_line1',
      'payment_address_line2',
      'payment_routing_number',
      'payment_account_number',
      'sender_name',
    ],
  },
  {
    name: 'Zero Balance Letter',
    aliases: ['Zero balance letter', 'Zero Balance'],
    file: 'zero-balance-letter.html',
    variables: [
      'brand_logo_url',
      'lender_name',
      'contact_email',
      'letter_date',
      'merchant_legal_name',
      'agreement_date',
      'zero_balance_statement',
    ],
  },
  {
    name: 'Payoff Wire Instructions',
    aliases: ['Payoff wire instructions', 'Wire Instructions'],
    file: 'payoff-wire-instructions.html',
    variables: [
      'brand_logo_url',
      'lender_name',
      'merchant_legal_name',
      'customer_id',
      'payoff_amount',
      'client_name',
      'letter_date',
      'beneficiary_name',
      'bank_name',
      'bank_address_line1',
      'bank_city_state_zip',
      'routing_number',
      'account_number',
    ],
  },
];

function readTemplateBody(fileName: string): string {
  const filePath = path.join(TEMPLATES_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Template file not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, 'utf8').trim();
}

/** Match on any known name for the letter, ignoring case, so re-runs update. */
async function findExisting(seed: LetterSeed) {
  for (const candidate of [seed.name, ...seed.aliases]) {
    const row = await prisma.paymentTemplate.findFirst({
      where: {
        name: { equals: candidate, mode: 'insensitive' },
        category: PaymentTemplateType.letter,
      },
    });
    if (row) return row;
  }
  return null;
}

void (async () => {
  try {
    await prisma.$connect();
    for (const seed of LETTER_SEEDS) {
      const body = readTemplateBody(seed.file);
      if (!body.includes(BRAND_LOGO_TOKEN)) {
        console.warn(`[warn] ${seed.file} does not reference ${BRAND_LOGO_TOKEN}`);
      }

      const existing = await findExisting(seed);
      if (existing) {
        const updated = await prisma.paymentTemplate.update({
          where: { id: existing.id },
          data: {
            name: seed.name,
            body,
            variables: seed.variables,
            status: 'active',
          },
        });
        console.log(`Updated: ${updated.name} (${updated.id})`);
      } else {
        const created = await prisma.paymentTemplate.create({
          data: {
            name: seed.name,
            category: PaymentTemplateType.letter,
            body,
            variables: seed.variables,
            status: 'active',
          },
        });
        console.log(`Created: ${created.name} (${created.id})`);
      }
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
