import { randomUUID } from 'crypto';
import { Prisma, type SchedulePaymentTracking } from '@prisma/client';
import { SchedulePaymentTrackingStatus } from '@prisma/client';
import prisma from '../config/prismaClient';
import { resolveApplicationAttributedUserIdForActor } from '../middleware/authMiddleware';
import type { AuthenticatedUser } from './applicationService';
import { canUserAccessApplication } from './applicationService';
import {
  buildScheduleTrackingSummary,
  filterScheduleRowsByDealId,
  mapSchedulePaymentToApiWithTracking,
  resolveScheduleTrackingStatuses,
  type SchedulePaymentTrackingApiRow,
  type ScheduleTrackingSummary,
} from './schedulePaymentTrackingMatch';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

export type SchedulePaymentInput = {
  paymentNumber: number;
  scheduledDate: string;
  amount: number;
  label?: string | null;
};

export type ReplaceSchedulePaymentTrackingInput = {
  paymentStartDate?: string | null;
  effectiveStartDate?: string | null;
  dealId?: string | null;
  payments: SchedulePaymentInput[];
};

const parseIsoDateOnly = (value: string): Date | null => {
  const raw = String(value ?? '').trim();
  const m = raw.match(ISO_DATE);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
};

const toAmountDecimal = (amount: number): Prisma.Decimal => {
  const rounded = Math.round(amount * 100) / 100;
  return new Prisma.Decimal(rounded.toFixed(2));
};

export const mapSchedulePaymentToApi = (row: SchedulePaymentTracking) => ({
  id: row.id,
  applicationId: row.applicationId,
  dealId: row.dealId,
  batchId: row.batchId,
  paymentNumber: row.paymentNumber,
  scheduledDate: row.scheduledDate.toISOString().slice(0, 10),
  amount: Number(row.amount),
  label: row.label,
  paymentStartDate: row.paymentStartDate ? row.paymentStartDate.toISOString().slice(0, 10) : null,
  effectiveStartDate: row.effectiveStartDate ? row.effectiveStartDate.toISOString().slice(0, 10) : null,
  status: row.status.toLowerCase(),
  confirmedById: row.confirmedById,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export function validateSchedulePayments(
  payments: unknown,
): { ok: true; payments: SchedulePaymentInput[] } | { ok: false; message: string } {
  if (!Array.isArray(payments) || payments.length === 0) {
    return { ok: false, message: 'At least one scheduled payment is required' };
  }

  const normalized: SchedulePaymentInput[] = [];
  const seenNumbers = new Set<number>();

  for (let i = 0; i < payments.length; i += 1) {
    const raw = payments[i] as Record<string, unknown>;
    const paymentNumber =
      typeof raw.paymentNumber === 'number'
        ? raw.paymentNumber
        : typeof raw.index === 'number'
          ? raw.index
          : Number(raw.paymentNumber ?? raw.index);

    if (!Number.isInteger(paymentNumber) || paymentNumber < 1) {
      return { ok: false, message: `payments[${i}].paymentNumber must be a positive integer` };
    }
    if (seenNumbers.has(paymentNumber)) {
      return { ok: false, message: `Duplicate paymentNumber: ${paymentNumber}` };
    }
    seenNumbers.add(paymentNumber);

    const scheduledDate =
      typeof raw.scheduledDate === 'string'
        ? raw.scheduledDate
        : typeof raw.date === 'string'
          ? raw.date
          : '';
    if (!parseIsoDateOnly(scheduledDate)) {
      return { ok: false, message: `payments[${i}].scheduledDate must be YYYY-MM-DD` };
    }

    const amount = Number(raw.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: `payments[${i}].amount must be a positive number` };
    }

    normalized.push({
      paymentNumber,
      scheduledDate: scheduledDate.trim().slice(0, 10),
      amount,
      label: typeof raw.label === 'string' ? raw.label : null,
    });
  }

  normalized.sort((a, b) => a.paymentNumber - b.paymentNumber);
  return { ok: true, payments: normalized };
}

export async function replaceSchedulePaymentTracking(
  applicationId: string,
  user: AuthenticatedUser | null,
  input: ReplaceSchedulePaymentTrackingInput,
) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      dealId: true,
      referringAgentId: true,
      createdById: true,
      salesRepresentativeId: true,
      currentQueue: true,
      approvedByUnderwriterId: true,
      assignedUnderwriterId: true,
    },
  });

  if (!application) {
    return { notFound: true as const, forbidden: false as const, badRequest: false as const };
  }

  if (!canUserAccessApplication(application, user)) {
    return { notFound: false as const, forbidden: true as const, badRequest: false as const };
  }

  const validated = validateSchedulePayments(input.payments);
  if (!validated.ok) {
    return {
      notFound: false as const,
      forbidden: false as const,
      badRequest: true as const,
      message: validated.message,
    };
  }

  const paymentStartDate = input.paymentStartDate ? parseIsoDateOnly(input.paymentStartDate) : null;
  const effectiveStartDate = input.effectiveStartDate ? parseIsoDateOnly(input.effectiveStartDate) : null;
  if (input.paymentStartDate && !paymentStartDate) {
    return {
      notFound: false,
      forbidden: false,
      badRequest: true as const,
      message: 'paymentStartDate must be YYYY-MM-DD',
    };
  }
  if (input.effectiveStartDate && !effectiveStartDate) {
    return {
      notFound: false,
      forbidden: false,
      badRequest: true as const,
      message: 'effectiveStartDate must be YYYY-MM-DD',
    };
  }

  const dealId =
    (typeof input.dealId === 'string' && input.dealId.trim() ? input.dealId.trim() : null) ??
    application.dealId ??
    null;

  const batchId = randomUUID();
  const confirmedById = await resolveApplicationAttributedUserIdForActor(user?.id, {
    createdById: application.createdById,
    salesRepresentativeId: application.salesRepresentativeId,
  });

  const rows = validated.payments.map((p) => ({
    applicationId,
    dealId,
    batchId,
    paymentNumber: p.paymentNumber,
    scheduledDate: parseIsoDateOnly(p.scheduledDate)!,
    amount: toAmountDecimal(p.amount),
    label: p.label?.trim() ? p.label.trim() : null,
    paymentStartDate,
    effectiveStartDate,
    status: SchedulePaymentTrackingStatus.SCHEDULED,
    confirmedById,
  }));

  const result = await prisma.$transaction(async (tx) => {
    await tx.schedulePaymentTracking.updateMany({
      where: {
        applicationId,
        status: SchedulePaymentTrackingStatus.SCHEDULED,
      },
      data: {
        status: SchedulePaymentTrackingStatus.SUPERSEDED,
      },
    });

    await tx.schedulePaymentTracking.createMany({ data: rows });

    const created = await tx.schedulePaymentTracking.findMany({
      where: { batchId },
      orderBy: { paymentNumber: 'asc' },
    });

    return created;
  });

  const totalAmount = result.reduce((sum, row) => sum + Number(row.amount), 0);

  return {
    notFound: false as const,
    forbidden: false as const,
    badRequest: false as const,
    batchId,
    count: result.length,
    totalAmount,
    payments: result.map(mapSchedulePaymentToApi),
  };
}

export async function listSchedulePaymentTracking(
  applicationId: string,
  user: AuthenticatedUser | null,
  options?: { status?: 'scheduled' | 'superseded' | 'cancelled' | 'all'; batchId?: string },
) {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, referringAgentId: true, createdById: true, currentQueue: true, approvedByUnderwriterId: true, assignedUnderwriterId: true },
  });

  if (!application) {
    return { notFound: true as const, forbidden: false as const, payments: [] as SchedulePaymentTracking[] };
  }

  if (!canUserAccessApplication(application, user)) {
    return { notFound: false as const, forbidden: true as const, payments: [] as SchedulePaymentTracking[] };
  }

  const statusFilter =
    options?.status && options.status !== 'all'
      ? (options.status.toUpperCase() as SchedulePaymentTrackingStatus)
      : SchedulePaymentTrackingStatus.SCHEDULED;

  const where: Prisma.SchedulePaymentTrackingWhereInput = {
    applicationId,
    ...(options?.batchId ? { batchId: options.batchId } : {}),
    ...(options?.status === 'all' ? {} : { status: statusFilter }),
  };

  const payments = await prisma.schedulePaymentTracking.findMany({
    where,
    orderBy: { paymentNumber: 'asc' },
  });

  return { notFound: false as const, forbidden: false as const, payments };
}

export async function listSchedulePaymentTrackingWithMatch(
  applicationId: string,
  user: AuthenticatedUser | null,
  options?: {
    status?: 'scheduled' | 'superseded' | 'cancelled' | 'all';
    batchId?: string;
    dealId?: string;
  },
): Promise<{
  notFound: boolean;
  forbidden: boolean;
  payments: SchedulePaymentTrackingApiRow[];
  summary: ScheduleTrackingSummary;
}> {
  const emptySummary = buildScheduleTrackingSummary([]);

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { id: true, dealId: true, referringAgentId: true, createdById: true, currentQueue: true, approvedByUnderwriterId: true, assignedUnderwriterId: true },
  });

  if (!application) {
    return { notFound: true, forbidden: false, payments: [], summary: emptySummary };
  }

  if (!canUserAccessApplication(application, user)) {
    return { notFound: false, forbidden: true, payments: [], summary: emptySummary };
  }

  const listResult = await listSchedulePaymentTracking(applicationId, user, {
    status: options?.status,
    batchId: options?.batchId,
  });

  const effectiveDealId =
    (options?.dealId && options.dealId.trim() ? options.dealId.trim() : null) ??
    application.dealId ??
    null;

  const scheduleRows = filterScheduleRowsByDealId(listResult.payments, effectiveDealId).sort(
    (a, b) => {
      if (a.batchId !== b.batchId) {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      return a.paymentNumber - b.paymentNumber;
    },
  );

  const collectionPayments = await prisma.collectionPayment.findMany({
    where: { applicationId },
    select: {
      id: true,
      amount: true,
      status: true,
      scheduledDate: true,
      processedDate: true,
      Date: true,
      returnDate: true,
      dealId: true,
      notes: true,
      createdAt: true,
    },
    orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'asc' }],
  });

  const trackingStatuses = resolveScheduleTrackingStatuses(
    scheduleRows,
    collectionPayments,
    effectiveDealId,
  );

  const payments = scheduleRows.map((row, index) =>
    mapSchedulePaymentToApiWithTracking(row, trackingStatuses[index] ?? 'upcoming'),
  );

  return {
    notFound: false,
    forbidden: false,
    payments,
    summary: buildScheduleTrackingSummary(payments),
  };
}
