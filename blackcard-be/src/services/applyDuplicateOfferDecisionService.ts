import prisma from '../config/prismaClient';
import { syncTermsOfferFromOfferDecision } from './syncTermsOfferFromOfferDecision';
import {
  findApplicationsMatchingEinOrSsn,
  usableDedupeEin,
} from './applicationIdentityDedupeService';

function toNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const APPLICATION_UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i;

export async function resolveApplicationByIdOrNumber(idOrNumber: string | number) {
  const str = String(idOrNumber ?? '').trim();
  if (!str) return null;
  if (APPLICATION_UUID_RE.test(str)) {
    return prisma.application.findUnique({
      where: { id: str },
      include: {
        client: { select: { businessEinNumber: true, ownerSsn: true } },
        OfferDecision: true,
      },
    });
  }
  if (/^\d+$/.test(str)) {
    return prisma.application.findUnique({
      where: { applicationId: Number(str) },
      include: {
        client: { select: { businessEinNumber: true, ownerSsn: true } },
        OfferDecision: true,
      },
    });
  }
  return null;
}

/** Prefix of the Scrubbing tab's Additional Info note (frontend lib/additionalInfo.ts). */
const ADDITIONAL_INFO_NOTE_PREFIX = '__FX_ADDITIONAL_INFO__:';

/**
 * Replace the target's Scrubbing tab data with the source's: Bank Analysis
 * (banks + month rows), Positions and Additional Info. Leverage is computed in
 * the browser from positions + bank rows, so it follows automatically.
 *
 * Order matters: banks list by createdAt asc and Position.allocatedBankAnalysisId
 * is a 1-based index into that list, so copies get increasing createdAt values
 * in the source's order.
 */
async function copyScrubbingData(params: {
  sourceId: string;
  targetId: string;
  actorUserId: string | null;
}) {
  const [banks, positions, additionalInfoNote] = await Promise.all([
    prisma.bankAnalysis.findMany({
      where: { applicationId: params.sourceId },
      include: { BankAnalysisRow: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.position.findMany({
      where: { applicationId: params.sourceId },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.note.findFirst({
      where: {
        applicationId: params.sourceId,
        content: { startsWith: ADDITIONAL_INFO_NOTE_PREFIX },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Super Admin (org-admin) actors may not exist in this book's User table;
  // fall back to the source row's creator so the FK holds.
  const actorExists = params.actorUserId
    ? Boolean(await prisma.user.findUnique({ where: { id: params.actorUserId }, select: { id: true } }))
    : false;
  const actorId = actorExists ? params.actorUserId : null;

  const base = Date.now();
  await prisma.$transaction(async (tx) => {
    // Bank Analysis (rows and AI analyses cascade).
    await tx.bankAnalysis.deleteMany({ where: { applicationId: params.targetId } });
    for (const [index, bank] of banks.entries()) {
      const created = await tx.bankAnalysis.create({
        data: {
          applicationId: params.targetId,
          bankName: bank.bankName,
          accountNumber: bank.accountNumber,
          createdById: actorId || bank.createdById,
          createdAt: new Date(base + index),
          updatedAt: new Date(base + index),
        },
      });
      if (bank.BankAnalysisRow.length) {
        await tx.bankAnalysisRow.createMany({
          data: bank.BankAnalysisRow.map((row) => ({
            bankAnalysisId: created.id,
            monthLabel: row.monthLabel,
            monthDate: row.monthDate,
            totalCredit: row.totalCredit,
            loanTransfer: row.loanTransfer,
            deposit: row.deposit,
            other: row.other,
            nsfNegDays: row.nsfNegDays,
            lowBlcDays: row.lowBlcDays,
            avgDailyBlc: row.avgDailyBlc,
          })),
        });
      }
    }

    // Positions (allocatedBankAnalysisId is a bank index, kept as-is).
    await tx.position.deleteMany({ where: { applicationId: params.targetId } });
    for (const [index, p] of positions.entries()) {
      const { id: _id, positionId: _positionId, applicationId: _app, createdAt: _c, updatedAt: _u, ...rest } = p;
      await tx.position.create({
        data: {
          ...rest,
          applicationId: params.targetId,
          createdById: actorId || p.createdById,
          createdAt: new Date(base + index),
        },
      });
    }

    // Additional Info (latest prefixed note); plain notes stay the target's own.
    await tx.note.deleteMany({
      where: {
        applicationId: params.targetId,
        content: { startsWith: ADDITIONAL_INFO_NOTE_PREFIX },
      },
    });
    if (additionalInfoNote) {
      await tx.note.create({
        data: {
          applicationId: params.targetId,
          content: additionalInfoNote.content,
          createdById: actorId || additionalInfoNote.createdById,
        },
      });
    }
  });
}

/**
 * Copy the source deal's Offer Decision (and related recommendation fields)
 * onto the target (current) application. Source must share EIN or SSN with target.
 */
export async function applyDuplicateOfferDecision(params: {
  targetApplicationId: string;
  sourceApplicationId: string;
  actorUserId?: string | null;
}) {
  const target = await resolveApplicationByIdOrNumber(params.targetApplicationId);
  const source = await resolveApplicationByIdOrNumber(params.sourceApplicationId);

  if (!target) throw Object.assign(new Error('Target application not found'), { status: 404 });
  if (!source) throw Object.assign(new Error('Source application not found'), { status: 404 });
  if (target.id === source.id) {
    throw Object.assign(new Error('Cannot apply decision from the same application'), { status: 400 });
  }

  const ein = usableDedupeEin(target.client?.businessEinNumber);
  const ssn = target.client?.ownerSsn ?? null;
  if (!ein && !ssn) {
    throw Object.assign(
      new Error('Current application has no EIN or SSN to verify duplicate identity'),
      { status: 400 },
    );
  }

  const matches = await findApplicationsMatchingEinOrSsn({
    excludeApplicationId: target.id,
    ein,
    ssn,
  });
  if (!matches.some((m) => m.id === source.id)) {
    throw Object.assign(
      new Error('Source application is not an EIN/SSN duplicate of the current deal'),
      { status: 400 },
    );
  }

  const sourceDecision = source.OfferDecision;
  if (!sourceDecision || !String(sourceDecision.decision || '').trim()) {
    throw Object.assign(
      new Error('Source application has no offer decision to apply'),
      { status: 400 },
    );
  }

  const offerPayload = {
    decision: String(sourceDecision.decision),
    position: sourceDecision.position ?? null,
    offer: toNumberOrNull(sourceDecision.offer),
    rate: toNumberOrNull(sourceDecision.rate),
    term: sourceDecision.term ?? null,
    frequency: sourceDecision.frequency ?? null,
    repayPerPeriod: toNumberOrNull(sourceDecision.repayPerPeriod),
    monthlyPayment: toNumberOrNull(sourceDecision.monthlyPayment),
    fees: toNumberOrNull(sourceDecision.fees),
    ourRemit: toNumberOrNull(sourceDecision.ourRemit),
    totalRemit: toNumberOrNull(sourceDecision.totalRemit),
    refinanceAmount: toNumberOrNull(sourceDecision.refinanceAmount),
    notes: sourceDecision.notes
      ? `${sourceDecision.notes}\n\n[Applied from duplicate app #${source.applicationId}]`
      : `[Applied from duplicate app #${source.applicationId}]`,
    declineReason: sourceDecision.declineReason ?? null,
    userId: params.actorUserId || null,
  };

  const upserted = await prisma.offerDecision.upsert({
    where: { applicationId: target.id },
    create: {
      applicationId: target.id,
      ...offerPayload,
    },
    update: offerPayload,
  });

  await syncTermsOfferFromOfferDecision(target.id, params.actorUserId);

  const appUpdate: Record<string, unknown> = {};
  if (source.scrubberRecommendation) {
    appUpdate.scrubberRecommendation = source.scrubberRecommendation;
  }
  if (source.underwriterAction) {
    appUpdate.underwriterAction = source.underwriterAction;
  }
  const offerAmt = toNumberOrNull(sourceDecision.offer);
  if (offerAmt != null && offerAmt > 0) {
    appUpdate.loanAmount = offerAmt;
  }

  if (Object.keys(appUpdate).length > 0) {
    await prisma.application.update({
      where: { id: target.id },
      data: appUpdate,
    });
  }

  await copyScrubbingData({
    sourceId: source.id,
    targetId: target.id,
    actorUserId: params.actorUserId ?? null,
  });

  return {
    offerDecision: upserted,
    sourceApplicationId: source.id,
    sourceApplicationNumber: source.applicationId,
    targetApplicationId: target.id,
    targetApplicationNumber: target.applicationId,
  };
}
