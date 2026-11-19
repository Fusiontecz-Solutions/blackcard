/**
 * Collection payment sync (single-tenant book CRM).
 * Reads CollectionPayment from local Prisma into ReportPaymentFact.
 */
import type { Prisma } from '@prisma/client';
import prisma from '../../config/prismaClient';

type Row = Record<string, unknown>;

export type PaymentStatus = 'paid' | 'scheduled' | 'failed' | 'waived' | 'other';

const PAGE_SIZE = Math.min(500, Math.max(50, Number(process.env.REPORT_SYNC_PAGE_SIZE || 200)));
const MAX_PAGES = Math.max(1, Number(process.env.REPORT_SYNC_MAX_PAGES || 300));

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function date(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
function obj(v: unknown): Row | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null;
}

/** Map the tenant's free-form status into the five buckets the reports use. */
export function normalizePaymentStatus(raw: unknown): PaymentStatus {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!s) return 'other';
  if (/paid|processed|success|cleared|settled|complete|received/.test(s)) return 'paid';
  if (/fail|return|nsf|insufficient|bounce|declin|reject|chargeback|error|unpaid|missed/.test(s)) return 'failed';
  if (/waiv|forgiv|cancel|void|skip/.test(s)) return 'waived';
  if (/sched|upcoming|due|pending|planned|expected|in progress|initiated|submitted|processing/.test(s)) return 'scheduled';
  return 'other';
}

export interface MappedPayment {
  paymentUuid: string;
  data: Omit<Prisma.ReportPaymentFactUncheckedCreateInput, 'bookId' | 'paymentUuid' | 'id'>;
}

export function mapTenantPayment(row: Row): MappedPayment | null {
  const uuid = str(row._id ?? row.id ?? row.paymentId);
  if (!uuid) return null;
  const app = obj(row.application);
  const client = app ? obj(app.client) : null;
  const business = client ? obj(client.business) : null;
  const rawStatus = str(row.status ?? row.paymentStatus ?? row.state);
  const status = normalizePaymentStatus(rawStatus);
  const scheduled = date(row.scheduledDate ?? row.dueDate ?? row.Date ?? row.date);
  const processed = date(row.processedDate ?? row.paidDate ?? row.paidAt ?? row.processedAt ?? (status === 'paid' ? row.updatedAt : null));
  return {
    paymentUuid: uuid,
    data: {
      applicationUuid: str(row.applicationId ?? row.application_id ?? (app ? app._id ?? app.id : null)),
      applicationNumericId: app ? str(app.applicationId) : str(row.applicationNumericId),
      dealId: str(row.dealId ?? (app ? app.dealId : null)),
      merchantName:
        str(row.merchantName) ||
        str(row.businessName) ||
        (business ? str(business.name) : null) ||
        (client ? str(client.businessName) : null) ||
        (app ? str(app.dealDisplayName) : null),
      amount: num(row.amount ?? row.scheduledAmount ?? row.expectedAmount),
      paidAmount: num(row.paidAmount ?? row.amountPaid ?? (status === 'paid' ? row.amount : null)),
      status,
      rawStatus,
      failureReason: str(row.failureReason ?? row.returnReason ?? row.reason ?? row.errorMessage ?? (status === 'failed' ? row.notes : null)),
      method: str(row.method ?? row.paymentMethod ?? row.type),
      scheduledDate: scheduled,
      processedDate: processed,
      createdAtTenant: date(row.createdAt),
      updatedAtTenant: date(row.updatedAt),
      notes: str(row.notes),
      raw: row as Prisma.InputJsonValue,
      syncedAt: new Date(),
    },
  };
}

function extractRows(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  const p = obj(payload);
  if (!p) return [];
  const data = p.data;
  if (Array.isArray(data)) return data as Row[];
  const d = obj(data);
  if (d) for (const k of ['data', 'items', 'payments', 'rows']) if (Array.isArray(d[k])) return d[k] as Row[];
  return [];
}

async function* iterateLocalPayments(since: Date | null): AsyncGenerator<Row[]> {
  for (let page = 0; page < MAX_PAGES; page++) {
    const rows = await prisma.collectionPayment.findMany({
      where: since ? { updatedAt: { gte: since } } : undefined,
      include: {
        Application: {
          include: {
            client: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
    });
    if (!rows.length) return;
    // Normalize relation key to `application` for mapTenantPayment.
    const mapped = rows.map((r) => {
      const plain = JSON.parse(JSON.stringify(r)) as Row;
      if (plain.Application && !plain.application) plain.application = plain.Application;
      return plain;
    });
    yield mapped;
    if (rows.length < PAGE_SIZE) return;
  }
}

export async function syncPaymentsForBook(bookId: string, since: Date | null): Promise<{ seen: number; upserted: number }> {
  let seen = 0;
  let upserted = 0;
  // Merchant names: fall back to the application fact when the payment row lacks one.
  for await (const rows of iterateLocalPayments(since)) {
    seen += rows.length;
    const mapped = rows.map(mapTenantPayment).filter((m): m is MappedPayment => !!m);
    const appIds = [...new Set(mapped.map((m) => m.data.applicationUuid).filter((x): x is string => !!x))];
    const apps = appIds.length
      ? await prisma.reportApplicationFact.findMany({ where: { bookId, applicationUuid: { in: appIds } }, select: { applicationUuid: true, merchantName: true, applicationNumericId: true, dealId: true } })
      : [];
    const appMap = new Map(apps.map((a) => [a.applicationUuid, a]));
    for (const m of mapped) {
      const a = m.data.applicationUuid ? appMap.get(m.data.applicationUuid) : undefined;
      const data = {
        ...m.data,
        merchantName: m.data.merchantName ?? a?.merchantName ?? null,
        applicationNumericId: m.data.applicationNumericId ?? a?.applicationNumericId ?? null,
        dealId: m.data.dealId ?? a?.dealId ?? null,
      };
      await prisma.reportPaymentFact.upsert({
        where: { bookId_paymentUuid: { bookId, paymentUuid: m.paymentUuid } },
        create: { bookId, paymentUuid: m.paymentUuid, ...data },
        update: data,
      });
      upserted += 1;
    }
  }
  return { seen, upserted };
}
