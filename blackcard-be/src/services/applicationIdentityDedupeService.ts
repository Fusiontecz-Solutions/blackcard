import type { Prisma } from '@prisma/client';
import prisma from '../config/prismaClient';
import { looksLikeEin } from './einSanitizer';

function normalizeIdentityToken(value: unknown): string {
  return String(value ?? '').trim();
}

/**
 * OCR junk (e.g. "DateBusiness") must never be used as an EIN match key.
 * Only a real 9-digit EIN is an identity.
 */
export function usableDedupeEin(value: unknown): string | null {
  const einNorm = normalizeIdentityToken(value);
  if (!einNorm || !looksLikeEin(einNorm)) return null;
  return einNorm;
}

/** Prisma OR clauses for exact EIN / owner SSN identity matches (no name or filename). */
export function buildEinOrSsnClientWhere(
  ein: string | null | undefined,
  ssn: string | null | undefined,
): Prisma.ClientWhereInput[] {
  const clauses: Prisma.ClientWhereInput[] = [];
  const einNorm = usableDedupeEin(ein);
  const ssnNorm = normalizeIdentityToken(ssn);
  if (einNorm) {
    clauses.push({ businessEinNumber: einNorm });
  }
  if (ssnNorm) {
    clauses.push({ ownerSsn: ssnNorm });
    clauses.push({ owners: { some: { ssn: ssnNorm } } });
  }
  return clauses;
}

const duplicateAppInclude = {
  client: true,
  createdBy: { select: { id: true, firstName: true, lastName: true, email: true } },
  OfferDecision: {
    select: {
      decision: true,
      offer: true,
      rate: true,
      term: true,
      frequency: true,
      position: true,
      repayPerPeriod: true,
      monthlyPayment: true,
      fees: true,
      ourRemit: true,
      totalRemit: true,
      refinanceAmount: true,
      declineReason: true,
      notes: true,
    },
  },
} as const;

/**
 * Other applications that share the same EIN and/or owner SSN.
 * Does not match on business name, client id alone, or PDF filename.
 */
export async function findApplicationsMatchingEinOrSsn(params: {
  excludeApplicationId: string;
  ein?: string | null;
  ssn?: string | null;
}) {
  const identityOr = buildEinOrSsnClientWhere(params.ein, params.ssn);
  if (!identityOr.length) return [];

  return prisma.application.findMany({
    where: {
      id: { not: params.excludeApplicationId },
      deletedAt: null,
      client: { OR: identityOr },
    },
    include: duplicateAppInclude,
    orderBy: { createdAt: 'desc' },
  });
}

/** True when another non-deleted application already exists with the same EIN or SSN. */
export async function hasPriorApplicationWithEinOrSsn(params: {
  excludeApplicationId?: string;
  ein?: string | null;
  ssn?: string | null;
}): Promise<boolean> {
  const identityOr = buildEinOrSsnClientWhere(params.ein, params.ssn);
  if (!identityOr.length) return false;

  const existing = await prisma.application.findFirst({
    where: {
      ...(params.excludeApplicationId
        ? { id: { not: params.excludeApplicationId } }
        : {}),
      deletedAt: null,
      client: { OR: identityOr },
    },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Sync `Application.isDuplicate` for every live deal that shares this EIN/SSN:
 * two or more apps → all tagged duplicate; a single leftover app → clear the tag.
 */
export async function syncDuplicateFlagsForEinOrSsn(params: {
  ein?: string | null;
  ssn?: string | null;
}): Promise<void> {
  const identityOr = buildEinOrSsnClientWhere(params.ein, params.ssn);
  if (!identityOr.length) return;

  const apps = await prisma.application.findMany({
    where: {
      deletedAt: null,
      client: { OR: identityOr },
    },
    select: { id: true },
  });

  if (!apps.length) return;

  const isDuplicate = apps.length > 1;
  await prisma.application.updateMany({
    where: { id: { in: apps.map((a) => a.id) } },
    data: { isDuplicate },
  });
}

/** Load client identity from an application and sync the duplicate tag. */
export async function syncDuplicateFlagForApplication(
  applicationId: string,
): Promise<boolean> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      client: { select: { businessEinNumber: true, ownerSsn: true } },
    },
  });
  if (!app?.client) return false;

  const ein = usableDedupeEin(app.client.businessEinNumber);
  const ssn = app.client.ownerSsn;
  if (!ein && !normalizeIdentityToken(ssn)) {
    await prisma.application.update({
      where: { id: applicationId },
      data: { isDuplicate: false },
    });
    return false;
  }
  await syncDuplicateFlagsForEinOrSsn({ ein, ssn });

  const refreshed = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { isDuplicate: true },
  });
  return !!refreshed?.isDuplicate;
}
