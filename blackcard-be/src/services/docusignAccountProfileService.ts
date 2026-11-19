import prisma from '../config/prismaClient';
import {
  isLikelyRsaPrivateKeyPem,
  normalizePemKey,
} from './docusign/utils/normalize-pem-key';

export type DocuSignAccountProfileInput = {
  name: string;
  integrationKey: string;
  clientSecret?: string | null;
  impersonatedUserId: string;
  rsaPrivateKey?: string;
  accountId?: string | null;
  baseUri?: string | null;
  isActive?: boolean;
};

function maskSecret(value?: string | null): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (v.length <= 8) return '********';
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

export function serializeDocuSignAccountProfile(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    integrationKey: row.integrationKey,
    clientSecret: row.clientSecret ? maskSecret(String(row.clientSecret)) : null,
    hasClientSecret: Boolean(row.clientSecret),
    impersonatedUserId: row.impersonatedUserId,
    rsaPrivateKey: row.rsaPrivateKey ? '********' : null,
    hasRsaPrivateKey: Boolean(row.rsaPrivateKey),
    accountId: row.accountId ?? null,
    baseUri: row.baseUri ?? null,
    isActive: row.isActive !== false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    funderCount: Array.isArray(row.funders) ? row.funders.length : undefined,
  };
}

export async function listDocuSignAccountProfiles() {
  const rows = await prisma.docuSignAccountProfile.findMany({
    orderBy: [{ name: 'asc' }],
    include: {
      funders: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => serializeDocuSignAccountProfile(r as unknown as Record<string, unknown>));
}

export async function listDocuSignAccountProfileOptions() {
  const rows = await prisma.docuSignAccountProfile.findMany({
    where: { isActive: true },
    orderBy: [{ name: 'asc' }],
    select: { id: true, name: true },
  });
  return rows;
}

export async function getDocuSignAccountProfileById(id: string) {
  const row = await prisma.docuSignAccountProfile.findUnique({
    where: { id },
    include: { funders: { select: { id: true, name: true } } },
  });
  if (!row) return null;
  return serializeDocuSignAccountProfile(row as unknown as Record<string, unknown>);
}

export async function getDocuSignAccountProfileCredentials(id: string) {
  return prisma.docuSignAccountProfile.findFirst({
    where: { id, isActive: true },
  });
}

export async function createDocuSignAccountProfile(input: DocuSignAccountProfileInput) {
  const rsaPrivateKey = normalizePemKey(String(input.rsaPrivateKey || ''));
  if (!rsaPrivateKey) {
    throw new Error('RSA private key is required when creating a DocuSign account.');
  }
  if (!isLikelyRsaPrivateKeyPem(rsaPrivateKey)) {
    throw new Error('Paste a valid RSA private key from DocuSign Apps and Keys.');
  }

  const row = await prisma.docuSignAccountProfile.create({
    data: {
      name: String(input.name).trim(),
      integrationKey: String(input.integrationKey).trim(),
      clientSecret: input.clientSecret ? String(input.clientSecret).trim() : null,
      impersonatedUserId: String(input.impersonatedUserId).trim(),
      rsaPrivateKey,
      accountId: input.accountId ? String(input.accountId).trim() : null,
      baseUri: input.baseUri ? String(input.baseUri).trim() : null,
      isActive: input.isActive !== false,
    },
  });
  return serializeDocuSignAccountProfile(row as unknown as Record<string, unknown>);
}

export async function updateDocuSignAccountProfile(
  id: string,
  input: Partial<DocuSignAccountProfileInput>,
) {
  const existing = await prisma.docuSignAccountProfile.findUnique({ where: { id } });
  if (!existing) throw new Error('DocuSign account profile not found.');

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = String(input.name).trim();
  if (input.integrationKey !== undefined) data.integrationKey = String(input.integrationKey).trim();
  if (input.clientSecret !== undefined) {
    data.clientSecret = input.clientSecret ? String(input.clientSecret).trim() : null;
  }
  if (input.impersonatedUserId !== undefined) {
    data.impersonatedUserId = String(input.impersonatedUserId).trim();
  }
  if (input.rsaPrivateKey !== undefined) {
    const key = normalizePemKey(String(input.rsaPrivateKey));
    if (key) {
      if (!isLikelyRsaPrivateKeyPem(key)) {
        throw new Error('Paste a valid RSA private key from DocuSign Apps and Keys.');
      }
      data.rsaPrivateKey = key;
    }
  }
  if (input.accountId !== undefined) {
    data.accountId = input.accountId ? String(input.accountId).trim() : null;
  }
  if (input.baseUri !== undefined) data.baseUri = input.baseUri ? String(input.baseUri).trim() : null;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

  const row = await prisma.docuSignAccountProfile.update({
    where: { id },
    data: data as any,
  });
  return serializeDocuSignAccountProfile(row as unknown as Record<string, unknown>);
}

export async function deleteDocuSignAccountProfile(id: string) {
  const linked = await prisma.funderProfile.count({
    where: { docusignAccountProfileId: id },
  });
  if (linked > 0) {
    throw new Error(
      `Cannot delete: ${linked} funder(s) still use this DocuSign account. Reassign them first.`,
    );
  }
  await prisma.docuSignAccountProfile.delete({ where: { id } });
  return { success: true };
}
