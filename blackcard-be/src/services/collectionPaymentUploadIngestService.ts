import fs from 'fs/promises';
import { CollectionPaymentSource, CollectionPaymentStatus, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import prisma from '../config/prismaClient';
import { parseExcelDate } from './applicationBulkExcelIngestService';
import { distributeSyndicatorCreditsForPayments } from './syndicatorRepaymentService';
import { partitionAlreadyImportedPayments } from './collectionPaymentDedupe';

const CHUNK_SIZE = 1000;
const MAX_FAILED_ROWS_TRACKED = 5000;
const MAX_UPLOAD_ROWS = 1000;

type UploadProgress = {
  totalRows: number;
  processedRows: number;
  successCount: number;
  failedCount: number;
  failedRows: Array<{ rowNumber: number; dealId: string; reason: string }>;
};

type PreparedRow = Prisma.CollectionPaymentCreateManyInput;

const normalizeHeader = (header: string): string =>
  String(header || '')
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const getRowValue = (row: Record<string, unknown>, ...candidates: string[]): unknown => {
  const wanted = new Set(candidates.map(normalizeHeader));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normalizeHeader(key))) return value;
  }
  return undefined;
};

const hasCellValue = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
};

const toAmount = (value: unknown): number | null => {
  if (!hasCellValue(value)) return null;
  const normalized =
    typeof value === 'string' ? value.replace(/[$,\s]/g, '') : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const toDealId = (value: unknown): string => {
  if (value == null) return '';
  const raw = String(value).trim();
  // Excel often serializes text-like numeric ids as "12345.0"
  return raw.replace(/\.0+$/, '');
};

const dealIdKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');

const buildFailedRow = (rowNumber: number, dealId: string, reason: string) => ({ rowNumber, dealId, reason });

const TRANSACTION_ID_COLUMN_CANDIDATES = [
  'Deal ID',
  'DealId',
  'Deal Id',
  'Deal',
  'Deal Number',
  'Deal No',
  'Deal #',
  'Application ID',
  'ApplicationId',
  'Application Id',
  'App ID',
  'AppId',
  'Application UUID',
  'Application',
  'Contract Number',
  'Contract No',
  'Contract #',
  'Order ID',
  'OrderId',
  'External Order ID',
];

const TRANSACTION_DEAL_ID_COLUMN_CANDIDATES = [
  'Deal ID',
  'DealId',
  'Deal Id',
  'Deal',
  'Deal Number',
  'Deal No',
  'Deal #',
];

const TRANSACTION_NAME_COLUMN_CANDIDATES = [
  'Business Name',
  'Business',
  'Merchant Name',
  'Merchant',
  'Client Name',
  'Company Name',
  'Deal Name',
];

const resolveRowIdentifierCandidates = (row: Record<string, unknown>): string[] => {
  const out: string[] = [];
  const pushUnique = (value: unknown) => {
    const normalized = toDealId(value);
    if (!normalized) return;
    if (!out.includes(normalized)) out.push(normalized);
  };

  pushUnique(getRowValue(row, ...TRANSACTION_ID_COLUMN_CANDIDATES));
  for (const column of TRANSACTION_ID_COLUMN_CANDIDATES) {
    pushUnique(getRowValue(row, column));
  }
  for (const column of TRANSACTION_NAME_COLUMN_CANDIDATES) {
    pushUnique(getRowValue(row, column));
  }
  return out;
};

const resolveExcelDealId = (row: Record<string, unknown>): string =>
  toDealId(getRowValue(row, ...TRANSACTION_DEAL_ID_COLUMN_CANDIDATES));

const dealIdFromApplicationNote = (value: unknown): string => {
  const text = String(value ?? '');
  const markerMatch = text.match(/\[DEAL_ID:([^\]]+)\]/i);
  return toDealId(markerMatch?.[1] ?? '');
};

export async function processCollectionPaymentUploadJob(
  payload: {
    queueJobId: string;
    filePath: string;
    workbookBuffer?: Buffer;
    fileBufferBase64?: string;
    previewOnly?: boolean;
  },
  onProgress?: (progress: UploadProgress) => Promise<void> | void,
): Promise<void> {
  const uploadJob = await prisma.collectionPaymentUploadJob.findUnique({
    where: { queueJobId: payload.queueJobId },
    select: {
      id: true,
      totalRows: true,
      processedRows: true,
      successCount: true,
      failedCount: true,
      failedRows: true,
    },
  });
  if (!uploadJob) {
    throw new Error(`Upload job not found for queueJobId: ${payload.queueJobId}`);
  }

  let workbookBuffer: Buffer;
  if (payload.workbookBuffer) {
    workbookBuffer = payload.workbookBuffer;
  } else if (payload.fileBufferBase64) {
    workbookBuffer = Buffer.from(payload.fileBufferBase64, 'base64');
  } else {
    try {
      workbookBuffer = await fs.readFile(payload.filePath);
    } catch (err) {
      const isMissingFile = (err as NodeJS.ErrnoException)?.code === 'ENOENT';
      if (isMissingFile) {
        throw new Error(
          `Upload file is no longer available for queueJobId ${payload.queueJobId}. Please re-upload the Excel file.`,
        );
      }
      throw err;
    }
  }
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellDates: false, raw: true });
  const firstSheet = workbook.SheetNames[0];

  if (!firstSheet) {
    throw new Error('Excel file has no sheet.');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet], { defval: null });
  if (rows.length > MAX_UPLOAD_ROWS) {
    throw new Error(`Maximum ${MAX_UPLOAD_ROWS} rows are supported per upload. Received ${rows.length} rows.`);
  }
  const progress: UploadProgress = {
    totalRows: rows.length,
    processedRows: Math.max(0, uploadJob.processedRows || 0),
    successCount: Math.max(0, uploadJob.successCount || 0),
    failedCount: Math.max(0, uploadJob.failedCount || 0),
    failedRows: Array.isArray(uploadJob.failedRows)
      ? (uploadJob.failedRows as Array<{ rowNumber: number; dealId: string; reason: string }>).slice(
          0,
          MAX_FAILED_ROWS_TRACKED,
        )
      : [],
  };
  const startIndex = Math.min(progress.processedRows, rows.length);

  const applications = await prisma.application.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      applicationId: true,
      dealId: true,
      note: true,
      dealDisplayName: true,
      client: {
        select: {
          businessName: true,
        },
      },
    },
  });
  const fallbackApplication = await prisma.application.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, dealId: true },
  });
  const fallbackApplicationId = fallbackApplication?.id ?? null;
  const fallbackDealId = toDealId(fallbackApplication?.dealId);

  const appIdByKey = new Map<string, string>();
  const canonicalDealIdByAppId = new Map<string, string>();
  const registerLookup = (rawKey: string, appId: string) => {
    const key = dealIdKey(rawKey);
    if (!key || appIdByKey.has(key)) return;
    appIdByKey.set(key, appId);
  };
  for (const app of applications) {
    const appUuid = toDealId(app.id);
    const appNumericId = toDealId(app.applicationId);
    const directDealId = toDealId(app.dealId);
    const markerDealId = dealIdFromApplicationNote(app.note);
    const businessName = toDealId((app as { client?: { businessName?: unknown } | null }).client?.businessName);
    const dealDisplayName = toDealId((app as { dealDisplayName?: unknown }).dealDisplayName);
    const canonicalDealId = directDealId || markerDealId;

    registerLookup(appUuid, app.id);
    registerLookup(appNumericId, app.id);
    registerLookup(directDealId, app.id);
    registerLookup(markerDealId, app.id);
    registerLookup(businessName, app.id);
    registerLookup(dealDisplayName, app.id);

    if (canonicalDealId) {
      canonicalDealIdByAppId.set(app.id, canonicalDealId);
    }
  }
  const flushProgress = async () => {
    if (!onProgress) return;
    await onProgress(progress);
  };
  const persistProgress = async (nextProcessedRows: number, failedRowsChunk: Array<{ rowNumber: number; dealId: string; reason: string }>, successInChunk: number, failedInChunk: number) => {
    await prisma.collectionPaymentUploadJob.update({
      where: { id: uploadJob.id },
      data: {
        processedRows: nextProcessedRows,
        successCount: progress.successCount + successInChunk,
        failedCount: progress.failedCount + failedInChunk,
        failedRows: progress.failedRows.concat(failedRowsChunk).slice(0, MAX_FAILED_ROWS_TRACKED),
        status: 'PROCESSING',
      },
    });

    const mergedFailedRowsAfterWrite = progress.failedRows
      .concat(failedRowsChunk)
      .slice(0, MAX_FAILED_ROWS_TRACKED);
    progress.processedRows = nextProcessedRows;
    progress.successCount += successInChunk;
    progress.failedCount += failedInChunk;
    progress.failedRows = mergedFailedRowsAfterWrite;
  };

  await prisma.collectionPaymentUploadJob.update({
    where: { queueJobId: payload.queueJobId },
    data: {
      totalRows: progress.totalRows,
      processedRows: progress.processedRows,
      successCount: progress.successCount,
      failedCount: progress.failedCount,
      failedRows: progress.failedRows,
      status: 'PROCESSING',
    },
  });

  const previewOnly = payload.previewOnly === true;
  for (let start = startIndex; start < rows.length; start += CHUNK_SIZE) {
    const chunk = rows.slice(start, start + CHUNK_SIZE);
    const preparedRows: PreparedRow[] = [];
    const preparedMeta: Array<{ rowNumber: number; dealId: string; isUnmatched: boolean }> = [];
    const failedRowsChunk: Array<{ rowNumber: number; dealId: string; reason: string }> = [];
    let failedInChunk = 0;
    let successInChunk = 0;
    const successfulRowsForSyndicatorCredits: PreparedRow[] = [];

    const pushFailedInChunk = (rowNumber: number, dealId: string, reason: string) => {
      failedInChunk += 1;
      if (failedRowsChunk.length < MAX_FAILED_ROWS_TRACKED) {
        failedRowsChunk.push(buildFailedRow(rowNumber, dealId, reason));
      }
    };

    console.log({
      startIndex,
      currentIndex: start,
      processedRows: progress.processedRows,
    });

    chunk.forEach((row, chunkIndex) => {
      const rowNumber = start + chunkIndex + 2;
      const excelDealId = resolveExcelDealId(row);
      const rowIdentifierCandidates = resolveRowIdentifierCandidates(row);
      const rowIdentifier = excelDealId || rowIdentifierCandidates[0] || '';

      const amountRaw = getRowValue(row, 'Amount');
      const parsedAmount = toAmount(amountRaw);
      const amount = parsedAmount === null ? 0 : parsedAmount;
      const dateRaw = getRowValue(row, 'Date');
      const parsedDate = parseExcelDate(dateRaw as string | number | Date);
      const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : new Date();
      const returnDateRaw = getRowValue(row, 'Return Date', 'ReturnDate', 'Return Date ');
      const parsedReturnDate = hasCellValue(returnDateRaw)
        ? parseExcelDate(returnDateRaw as string | number | Date)
        : null;
      const returnDate =
        parsedReturnDate && !Number.isNaN(parsedReturnDate.getTime()) ? parsedReturnDate : null;
      const notesRaw = getRowValue(row, 'Notes', 'Note', 'Remarks', 'Remark', 'Description');
      const notes = hasCellValue(notesRaw) ? String(notesRaw).trim() : '';

      const debit = getRowValue(row, 'Debit');
      const credit = getRowValue(row, 'Credit');
      const hasCredit = hasCellValue(credit);
      const hasDebit = hasCellValue(debit);
      const statusRaw = String(getRowValue(row, 'Status', 'Payment Status') || '')
        .trim()
        .toLowerCase();
      const status = hasCredit
        ? CollectionPaymentStatus.CREDIT
        : hasDebit
          ? CollectionPaymentStatus.DEBIT
          : statusRaw === 'credit'
            ? CollectionPaymentStatus.CREDIT
            : statusRaw === 'failed'
              ? CollectionPaymentStatus.FAILED
              : statusRaw === 'debit'
                ? CollectionPaymentStatus.DEBIT
                : statusRaw === 'paid'
                  ? CollectionPaymentStatus.PAID
                  : statusRaw === 'manual'
                    ? CollectionPaymentStatus.MANUAL
                    : amount !== null && amount < 0
                      ? CollectionPaymentStatus.DEBIT
                      : CollectionPaymentStatus.CREDIT;

      if (hasCellValue(returnDateRaw) && !returnDate) {
        // Return date is optional; keep row insertable even if this value is malformed.
      }

      const matchedApplicationId =
        [excelDealId, ...rowIdentifierCandidates]
          .map((candidate) => appIdByKey.get(dealIdKey(candidate)))
          .find((appId): appId is string => Boolean(appId)) ?? null;
      const resolvedApplicationId = matchedApplicationId ?? fallbackApplicationId;
      if (!resolvedApplicationId) {
        pushFailedInChunk(
          rowNumber,
          rowIdentifier,
          'No application found and fallback application is unavailable',
        );
        return;
      }
      const canonicalDealId =
        (excelDealId || canonicalDealIdByAppId.get(resolvedApplicationId)) ??
        rowIdentifier ??
        fallbackDealId;
      const isUnmatched = !matchedApplicationId;
      const finalNotes = isUnmatched
        ? `[UPLOAD_UNMAPPED_IDENTIFIER:${rowIdentifier || 'EMPTY'}] ${notes}`.trim()
        : notes;

      preparedRows.push({
        applicationId: resolvedApplicationId,
        dealId: canonicalDealId || null,
        amount: new Prisma.Decimal(amount),
        Date: date,
        returnDate,
        status,
        scheduledDate: date,
        source: CollectionPaymentSource.MANUAL,
        notes: finalNotes,
      });
      preparedMeta.push({ rowNumber, dealId: canonicalDealId || rowIdentifier, isUnmatched });
    });

    // Idempotency: skip transactions already stored so re-uploads don't duplicate payments or
    // re-allocate repayments to syndicators.
    if (!previewOnly && preparedRows.length) {
      const { freshIndices, duplicateIndices } = await partitionAlreadyImportedPayments(prisma, preparedRows);
      for (const i of duplicateIndices) {
        pushFailedInChunk(
          preparedMeta[i]!.rowNumber,
          preparedMeta[i]!.dealId,
          'Already imported — duplicate transaction skipped.',
        );
      }
      if (duplicateIndices.length) {
        const fresh = new Set(freshIndices);
        const keptRows = preparedRows.filter((_, i) => fresh.has(i));
        const keptMeta = preparedMeta.filter((_, i) => fresh.has(i));
        preparedRows.splice(0, preparedRows.length, ...keptRows);
        preparedMeta.splice(0, preparedMeta.length, ...keptMeta);
      }
    }
    // Rows parked on the fallback application must not be split among that deal's syndicators.
    const syndicatorEligible = new Set(preparedRows.filter((_, i) => !preparedMeta[i]!.isUnmatched));

    try {
      const nextProcessedRows = start + chunk.length;
      if (previewOnly) {
        successInChunk += preparedRows.length;
      } else {
        await prisma.$transaction(async (tx) => {
          if (preparedRows.length) {
            try {
              await tx.collectionPayment.createMany({ data: preparedRows });
              successInChunk += preparedRows.length;
              successfulRowsForSyndicatorCredits.push(...preparedRows.filter((r) => syndicatorEligible.has(r)));
            } catch (chunkErr) {
              for (let i = 0; i < preparedRows.length; i++) {
                try {
                  await tx.collectionPayment.create({ data: preparedRows[i] });
                  successInChunk += 1;
                  if (syndicatorEligible.has(preparedRows[i]!)) successfulRowsForSyndicatorCredits.push(preparedRows[i]!);
                } catch (rowErr) {
                  const reason =
                    rowErr instanceof Error ? rowErr.message : chunkErr instanceof Error ? chunkErr.message : 'Insert failed';
                  pushFailedInChunk(preparedMeta[i]!.rowNumber, preparedMeta[i]!.dealId, reason);
                }
              }
            }
          }
        });
      }
      await persistProgress(nextProcessedRows, failedRowsChunk, successInChunk, failedInChunk);
      if (!previewOnly && successfulRowsForSyndicatorCredits.length) {
        await distributeSyndicatorCreditsForPayments(prisma, successfulRowsForSyndicatorCredits);
      }
      await flushProgress();
    } catch (err) {
      if (previewOnly) {
        throw err;
      }
      console.error('Collection payment upload chunk processing error:', {
        queueJobId: payload.queueJobId,
        currentIndex: start,
        error: err instanceof Error ? err.message : err,
      });
      const nextProcessedRows = start + chunk.length;
      // Last-resort fallback: attempt each prepared row independently so one chunk error
      // does not prevent remaining rows in this chunk from being processed.
      for (let i = 0; i < preparedRows.length; i += 1) {
        try {
          await prisma.collectionPayment.create({ data: preparedRows[i]! });
          successInChunk += 1;
          if (syndicatorEligible.has(preparedRows[i]!)) successfulRowsForSyndicatorCredits.push(preparedRows[i]!);
        } catch (rowErr) {
          const reason = rowErr instanceof Error ? rowErr.message : 'Insert failed';
          pushFailedInChunk(preparedMeta[i]!.rowNumber, preparedMeta[i]!.dealId, reason);
        }
      }

      await persistProgress(nextProcessedRows, failedRowsChunk, successInChunk, failedInChunk);
      if (successfulRowsForSyndicatorCredits.length) {
        await distributeSyndicatorCreditsForPayments(prisma, successfulRowsForSyndicatorCredits);
      }
      await flushProgress();
    }
  }

  // Keep staged file for reliability across restarts/retries; cleanup can be handled by
  // a periodic temp-file janitor job instead of deleting eagerly in-band.
}
