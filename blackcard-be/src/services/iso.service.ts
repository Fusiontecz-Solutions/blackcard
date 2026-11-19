import { randomUUID } from 'crypto';
import prisma from '../config/prismaClient';

type IsoCreateInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  bankAccountNo?: unknown;
  routingNumber?: unknown;
  commissionPercentage?: unknown;
  documents?: unknown;
  agreementAcceptedAt?: unknown;
  status?: unknown;
  planId?: unknown;
  contactName?: unknown;
  managerName?: unknown;
  missingDocs?: unknown;
  agreementEmail?: unknown;
  agreementSentAt?: unknown;
  agreementViewedAt?: unknown;
  tierOverride?: unknown;
  badges?: unknown;
};

type IsoUpdateInput = Partial<IsoCreateInput>;

const ISO_STATUSES = new Set(['active', 'pending', 'docs_requested', 'rejected', 'inactive']);
const ISO_TIERS = new Set(['Bronze', 'Silver', 'Gold', 'Platinum']);

const toIsoStatus = (value: unknown): string => {
  const v = String(value ?? '').trim().toLowerCase();
  if (!ISO_STATUSES.has(v)) {
    throw new Error(`status must be one of: ${[...ISO_STATUSES].join(', ')}`);
  }
  return v;
};

const toTierOverride = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const v = String(value).trim();
  if (!ISO_TIERS.has(v)) throw new Error(`tierOverride must be one of: ${[...ISO_TIERS].join(', ')}`);
  return v;
};

const toBadges = (value: unknown): string[] => {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error('badges must be an array');
  const out = new Set<string>();
  for (const b of value) {
    const s = String(b ?? '').trim().slice(0, 60);
    if (s) out.add(s);
  }
  return [...out].slice(0, 20);
};

async function toPlanId(value: unknown): Promise<string | null> {
  if (value === null || value === undefined || value === '') return null;
  const id = String(value).trim();
  const plan = await prisma.isoCommissionPlan.findUnique({ where: { id }, select: { id: true } });
  if (!plan) throw new Error('Commission plan not found');
  return id;
}

function parseOptionalDateField(value: unknown, field: string): Date | null {
  if (value === null || value === '') return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error(`${field} must be a valid date`);
  return d;
}

/** ISO portal onboarding / recognition fields shared by create and update. */
async function portalFields(input: IsoCreateInput) {
  const out: Record<string, unknown> = {};
  if (input.planId !== undefined) out.tierId = await toPlanId(input.planId);
  if (input.contactName !== undefined) out.contactName = toTrimmedOrNull(input.contactName);
  if (input.managerName !== undefined) out.managerName = toTrimmedOrNull(input.managerName);
  if (input.missingDocs !== undefined) out.missingDocs = toTrimmedOrNull(input.missingDocs);
  if (input.agreementEmail !== undefined) out.agreementEmail = toTrimmedOrNull(input.agreementEmail);
  if (input.agreementSentAt !== undefined) out.agreementSentAt = parseOptionalDateField(input.agreementSentAt, 'agreementSentAt');
  if (input.agreementViewedAt !== undefined) out.agreementViewedAt = parseOptionalDateField(input.agreementViewedAt, 'agreementViewedAt');
  if (input.tierOverride !== undefined) out.tierOverride = toTierOverride(input.tierOverride);
  if (input.badges !== undefined) out.badges = toBadges(input.badges);
  return out;
}

type IsoDocumentRecord = {
  id: string;
  url: string;
  originalName: string;
  publicId?: string | null;
  uploadedAt: string;
  /** Portal use: w9 | supporting | other */
  category?: string | null;
};

function parseDocuments(value: unknown): IsoDocumentRecord[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error('documents must be an array');
  const out: IsoDocumentRecord[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = String(o.url ?? '').trim();
    if (!url) continue;
    const idRaw = String(o.id ?? '').trim();
    const catRaw = o.category != null ? String(o.category).trim().toLowerCase().slice(0, 32) : '';
    const category =
      catRaw === 'w9' || catRaw === 'supporting' || catRaw === 'other' ? catRaw : null;

    const rec: IsoDocumentRecord = {
      id: idRaw || randomUUID(),
      url,
      originalName: (String(o.originalName ?? 'Document').trim().slice(0, 500) || 'Document'),
      publicId:
        o.publicId != null && String(o.publicId).trim() ? String(o.publicId).trim() : null,
      uploadedAt:
        typeof o.uploadedAt === 'string' && String(o.uploadedAt).trim()
          ? String(o.uploadedAt).trim()
          : new Date().toISOString(),
    };
    if (category) rec.category = category;
    out.push(rec);
  }
  return out;
}

// Prisma delegate may be missing from generated typings until `prisma generate` runs.
const isoModel = (prisma as any).iso;
let isoTableEnsured = false;

async function ensureIsoTableExists(): Promise<void> {
  if (isoTableEnsured) return;
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Iso" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "email" TEXT,
      "phone" TEXT,
      "bankAccountNo" TEXT NOT NULL,
      "routingNumber" TEXT NOT NULL,
      "commissionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Iso_pkey" PRIMARY KEY ("id")
    );
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Iso"
    ADD COLUMN IF NOT EXISTS "commissionPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Iso"
    ADD COLUMN IF NOT EXISTS "documents" JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Iso"
    ADD COLUMN IF NOT EXISTS "agreementAcceptedAt" TIMESTAMP(3);
  `);
  isoTableEnsured = true;
}

function parseAgreementAcceptedAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error('agreementAcceptedAt must be a valid date');
  return d;
}

const toTrimmedOrNull = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const v = String(value).trim();
  return v ? v : null;
};

const toRequiredTrimmed = (value: unknown, field: string): string => {
  const v = String(value ?? '').trim();
  if (!v) throw new Error(`${field} is required`);
  return v;
};

const toCommissionPercentage = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid number`);
  if (parsed < 0 || parsed > 100) throw new Error(`${field} must be between 0 and 100`);
  return Number(parsed.toFixed(2));
};

async function create(input: IsoCreateInput) {
  await ensureIsoTableExists();
  const name = toRequiredTrimmed(input.name, 'name');
  const bankAccountNo = toRequiredTrimmed(input.bankAccountNo, 'bankAccountNo');
  const routingNumber = toRequiredTrimmed(input.routingNumber, 'routingNumber');
  const commissionPercentage = toCommissionPercentage(input.commissionPercentage, 'commissionPercentage');
  const email = toTrimmedOrNull(input.email);
  const phone = toTrimmedOrNull(input.phone);
  const documents = parseDocuments(input.documents) ?? [];
  const agreementAcceptedAt = parseAgreementAcceptedAt(input.agreementAcceptedAt);
  const extra = await portalFields(input);

  return isoModel.create({
    data: {
      name,
      email,
      phone,
      bankAccountNo,
      routingNumber,
      commissionPercentage,
      documents,
      ...(agreementAcceptedAt !== undefined && agreementAcceptedAt !== null
        ? { agreementAcceptedAt }
        : {}),
      ...(input.status !== undefined ? { status: toIsoStatus(input.status) } : {}),
      ...extra,
    },
  });
}

async function getAll() {
  await ensureIsoTableExists();
  return isoModel.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      applications: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

async function getById(id: string) {
  await ensureIsoTableExists();
  const isoId = String(id ?? '').trim();
  if (!isoId) throw new Error('id is required');
  return isoModel.findUnique({
    where: { id: isoId },
    include: {
      applications: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

async function update(id: string, input: IsoUpdateInput) {
  await ensureIsoTableExists();
  const isoId = String(id ?? '').trim();
  if (!isoId) throw new Error('id is required');

  const existing = await isoModel.findUnique({ where: { id: isoId } });
  if (!existing) throw new Error('ISO not found');

  const payload: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    bankAccountNo?: string;
    routingNumber?: string;
    commissionPercentage?: number;
    documents?: IsoDocumentRecord[];
    agreementAcceptedAt?: Date | null;
    status?: string;
  } & Record<string, unknown> = await portalFields(input);

  if (input.name !== undefined) payload.name = toRequiredTrimmed(input.name, 'name');
  if (input.email !== undefined) payload.email = toTrimmedOrNull(input.email);
  if (input.phone !== undefined) payload.phone = toTrimmedOrNull(input.phone);
  if (input.bankAccountNo !== undefined) {
    payload.bankAccountNo = toRequiredTrimmed(input.bankAccountNo, 'bankAccountNo');
  }
  if (input.routingNumber !== undefined) {
    payload.routingNumber = toRequiredTrimmed(input.routingNumber, 'routingNumber');
  }
  if (input.commissionPercentage !== undefined) {
    payload.commissionPercentage = toCommissionPercentage(input.commissionPercentage, 'commissionPercentage');
  }
  if (input.documents !== undefined) {
    payload.documents = parseDocuments(input.documents) ?? [];
  }
  if (input.agreementAcceptedAt !== undefined) {
    payload.agreementAcceptedAt = parseAgreementAcceptedAt(input.agreementAcceptedAt) ?? null;
  }
  if (input.status !== undefined) payload.status = toIsoStatus(input.status);

  if (Object.keys(payload).length === 0) {
    throw new Error('No fields provided to update');
  }

  return isoModel.update({
    where: { id: isoId },
    data: payload,
  });
}

async function remove(id: string) {
  await ensureIsoTableExists();
  const isoId = String(id ?? '').trim();
  if (!isoId) throw new Error('id is required');

  const existing = await isoModel.findUnique({ where: { id: isoId } });
  if (!existing) throw new Error('ISO not found');

  await isoModel.delete({ where: { id: isoId } });
}

const isoService = {
  create,
  getAll,
  getById,
  update,
  delete: remove,
};

export default isoService;
