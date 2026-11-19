import prisma from '../../../config/prismaClient';
import uploadService from '../../uploadService';
import { slugifyFunderDocumentToken } from '../../../utils/funderContractLayout';
import { resolveEnvelopeFunderAuthHints } from './envelope-funder-auth';
import { findSignedPdfUrlInContractSendHistory, appendContractSendHistoryEntry } from './contract-send-history';
import type { Prisma } from '@prisma/client';

const SIGNED_CONTRACTS_ROOT = 'ih-crm/signed-contracts';

export type EnvelopePdfArchivePhase = 'sent' | 'completed';

export function buildSignedContractsFolder(args: {
  funderName?: string | null;
  funderProfileId?: string | null;
}): string {
  const byId = String(args.funderProfileId || '').trim();
  const byName = slugifyFunderDocumentToken(String(args.funderName || ''));
  const segment = byName || (byId ? `funder_${byId}` : 'unknown-funder');
  return `${SIGNED_CONTRACTS_ROOT}/${segment}`;
}

/** True when the Cloudinary archive filename is the completed/signed package (_signed.pdf). */
export function isSignedPhaseArchiveUrl(url: string | null | undefined): boolean {
  const href = String(url || '').trim();
  if (!href) return false;
  return /_signed\.pdf(\?|$)/i.test(href) || /\/signed-contract\//i.test(href);
}

/** True when Document.status indicates the envelope is fully signed. */
export function isDocumentFullySignedStatus(status: string | null | undefined): boolean {
  const s = String(status || '').trim().toLowerCase();
  return s === 'completed' || s === 'signed';
}

export type StoredEnvelopePdfArchive = {
  url: string;
  status: string | null;
  publicId: string | null;
};

/** Stored Cloudinary URL + Document status for an envelope package. */
export async function getStoredEnvelopePdfArchive(
  envelopeId: string,
): Promise<StoredEnvelopePdfArchive | null> {
  const eid = String(envelopeId || '').trim();
  if (!eid) return null;
  const row = await prisma.document.findFirst({
    where: { envelopeId: eid },
    select: {
      signedPdfUrl: true,
      signedPdfPublicId: true,
      status: true,
      applicationId: true,
    },
  });
  let url = String(row?.signedPdfUrl || '').trim();
  let status = row?.status != null ? String(row.status) : null;
  let publicId = row?.signedPdfPublicId != null ? String(row.signedPdfPublicId) : null;

  // Prior sends after resend: Document.envelopeId was replaced — look in send history.
  if (!url) {
    const fromHistory = await findSignedPdfUrlInContractSendHistory(eid);
    if (fromHistory?.url) {
      url = fromHistory.url;
      status = status || fromHistory.status;
      publicId = publicId || fromHistory.publicId;
    }
  }

  // Legacy fallback: ApplicationFile labels include the envelope id prefix.
  if (!url) {
    const envPart = eid.slice(0, 8);
    try {
      const file = await prisma.applicationFile.findFirst({
        where: {
          OR: [
            { originalName: { contains: envPart, mode: 'insensitive' } },
            { publicId: { contains: envPart, mode: 'insensitive' } },
            { url: { contains: envPart, mode: 'insensitive' } },
          ],
          mimeType: { contains: 'pdf', mode: 'insensitive' },
        },
        select: { url: true, publicId: true },
        orderBy: { uploadedAt: 'desc' },
      });
      const fileUrl = String(file?.url || '').trim();
      if (fileUrl) {
        url = fileUrl;
        publicId = publicId || String(file?.publicId || '').trim() || null;
      }
    } catch {
      /* optional fallback */
    }
  }

  if (!url) return null;

  // Contract may already be SIGNED/COMPLETED while Document.status lags behind.
  if (!isDocumentFullySignedStatus(status) && row?.applicationId) {
    try {
      const contract = await prisma.contract.findFirst({
        where: { applicationId: String(row.applicationId) },
        select: { status: true },
        orderBy: { updatedAt: 'desc' },
      });
      const cs = String(contract?.status || '').trim().toUpperCase();
      if (cs === 'SIGNED' || cs === 'COMPLETED') {
        status = 'completed';
      }
    } catch {
      /* keep Document.status */
    }
  }

  return {
    url,
    status,
    publicId,
  };
}

/** Stored Cloudinary URL for sent or completed envelope package (same Document column). */
export async function getStoredSignedPdfUrl(envelopeId: string): Promise<string | null> {
  const archive = await getStoredEnvelopePdfArchive(envelopeId);
  return archive?.url || null;
}

/** Fetch a previously archived envelope PDF (Cloudinary / HTTPS). */
export async function fetchStoredSignedPdfBuffer(url: string): Promise<Buffer | null> {
  const href = String(url || '').trim();
  if (!href.startsWith('http://') && !href.startsWith('https://')) return null;
  try {
    const res = await fetch(href);
    if (!res.ok) {
      console.warn(
        `[DocuSign] stored envelope PDF fetch failed (${res.status}) for ${href.slice(0, 120)}`,
      );
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length ? buf : null;
  } catch (err) {
    console.warn('[DocuSign] stored envelope PDF fetch error:', err);
    return null;
  }
}

/**
 * Upload envelope PDF into `ih-crm/signed-contracts/{funder}/…` and persist URL on Document.
 * - `sent`: archive once so CRM can show prefilled package without DocuSign GETs
 * - `completed`: replace sent archive with the fully signed PDF
 */
export async function archiveSignedEnvelopePdf(args: {
  envelopeId: string;
  pdf: Buffer;
  applicationId?: string | null;
  funderName?: string | null;
  funderProfileId?: string | null;
  phase?: EnvelopePdfArchivePhase;
  /** When true (completed), overwrite an existing sent archive. */
  replaceExisting?: boolean;
}): Promise<{ url: string; publicId: string } | null> {
  const eid = String(args.envelopeId || '').trim();
  const pdf = args.pdf;
  const phase: EnvelopePdfArchivePhase = args.phase === 'completed' ? 'completed' : 'sent';
  const replaceExisting = args.replaceExisting === true || phase === 'completed';
  if (!eid || !pdf?.length) return null;

  const existing = await prisma.document.findFirst({
    where: { envelopeId: eid },
    select: {
      id: true,
      applicationId: true,
      signedPdfUrl: true,
      signedPdfPublicId: true,
    },
  });
  const existingUrl = String(existing?.signedPdfUrl || '').trim();
  if (existingUrl && !replaceExisting) {
    return {
      url: existingUrl,
      publicId: String(existing?.signedPdfPublicId || '').trim(),
    };
  }

  let funderName = String(args.funderName || '').trim() || null;
  let funderProfileId = String(args.funderProfileId || '').trim() || null;
  const applicationId =
    String(args.applicationId || existing?.applicationId || '').trim() || null;

  if (!funderName && !funderProfileId) {
    try {
      const hints = await resolveEnvelopeFunderAuthHints(eid, {
        applicationId,
      });
      funderName = String(hints.funderName || '').trim() || null;
      funderProfileId = String(hints.funderProfileId || '').trim() || null;
    } catch {
      /* folder falls back to unknown-funder */
    }
  }

  const folder = buildSignedContractsFolder({ funderName, funderProfileId });
  const appPart = applicationId ? applicationId.slice(0, 8) : 'app';
  const envPart = eid.slice(0, 8);
  const suffix = phase === 'completed' ? 'signed' : 'sent';
  const fileName = `${appPart}_${envPart}_${suffix}.pdf`;

  const uploaded = await uploadService.uploadBuffer(pdf, folder, fileName, { forcePdf: true });
  if (!uploaded.success || !uploaded.data?.secure_url) {
    console.error(
      `[DocuSign] ${phase} PDF Cloudinary upload failed:`,
      uploaded.error || uploaded.message,
    );
    return null;
  }

  // Prefer a .pdf delivery URL (image/upload/…/file.pdf), never /raw/upload/.
  let url = String(uploaded.data.secure_url || uploaded.data.url || '').trim();
  if (url.includes('/raw/upload/')) {
    url = url.replace('/raw/upload/', '/image/upload/');
  }
  if (url && !/\.pdf(\?|$)/i.test(url)) {
    url = `${url}.pdf`;
  }
  const publicId = String(uploaded.data.public_id || '').trim();
  const format = String(uploaded.data.format || '').toLowerCase();
  if (format && format !== 'pdf') {
    console.warn(
      `[DocuSign] ${phase} PDF uploaded with unexpected Cloudinary format="${format}" (expected pdf)`,
    );
  }

  const updated = await prisma.document.updateMany({
    where: { envelopeId: eid },
    data: {
      signedPdfUrl: url,
      signedPdfPublicId: publicId || null,
    },
  });

  if (updated.count === 0) {
    // Prior / archived envelope — persist URL on contractSendHistory so view still works.
    try {
      let target =
        applicationId
          ? await prisma.contract.findUnique({
              where: { applicationId },
              select: { id: true, contractPrefillOverrides: true },
            })
          : null;
      if (!target) {
        const hits = await prisma.$queryRaw<Array<{ id: number }>>`
          SELECT c.id
          FROM "Contract" c
          WHERE c."contractPrefillOverrides" IS NOT NULL
            AND c."contractPrefillOverrides"::text LIKE ${'%' + eid + '%'}
          ORDER BY c.id DESC
          LIMIT 1
        `;
        if (hits[0]?.id) {
          target = await prisma.contract.findUnique({
            where: { id: hits[0].id },
            select: { id: true, contractPrefillOverrides: true },
          });
        }
      }
      if (target) {
        const merged = appendContractSendHistoryEntry(target.contractPrefillOverrides, {
          envelopeId: eid,
          status: phase === 'completed' ? 'completed' : 'sent',
          signedPdfUrl: url,
          signedPdfPublicId: publicId || null,
        });
        await prisma.contract.update({
          where: { id: target.id },
          data: { contractPrefillOverrides: merged as Prisma.InputJsonValue },
        });
        console.info(
          `[DocuSign] archived ${phase} PDF on contractSendHistory for envelope ${eid}`,
        );
      } else {
        console.warn(
          `[DocuSign] ${phase} PDF uploaded but no Document/Contract history for envelope ${eid} (url=${url})`,
        );
      }
    } catch (err) {
      console.warn(
        `[DocuSign] ${phase} PDF history archive failed for ${eid}:`,
        (err as { message?: string })?.message || err,
      );
    }
  } else {
    console.info(
      `[DocuSign] archived ${phase} PDF for envelope ${eid} → ${folder}/${fileName}`,
    );
  }

  // Best-effort: surface in application files list.
  if (applicationId) {
    const slug = phase === 'completed' ? 'signed-contract' : 'sent-contract';
    const label =
      phase === 'completed'
        ? `Signed contract (${envPart}).pdf`
        : `Sent contract package (${envPart}).pdf`;
    try {
      const prior = await prisma.applicationFile.findFirst({
        where: { applicationId, requestedDocumentSlug: slug },
        select: { id: true },
        orderBy: { uploadedAt: 'desc' },
      });
      if (prior?.id) {
        await prisma.applicationFile.update({
          where: { id: prior.id },
          data: {
            url,
            publicId: publicId || url,
            originalName: label,
            mimeType: 'application/pdf',
            size: pdf.length,
            uploadedAt: new Date(),
          },
        });
      } else {
        await prisma.applicationFile.create({
          data: {
            applicationId,
            url,
            publicId: publicId || url,
            originalName: label,
            mimeType: 'application/pdf',
            size: pdf.length,
            uploadedAt: new Date(),
            requestedDocumentSlug: slug,
          },
        });
      }
    } catch (err) {
      console.warn(
        `[DocuSign] ApplicationFile upsert for ${phase} PDF skipped:`,
        (err as { message?: string })?.message || err,
      );
    }
  }

  return { url, publicId };
}
