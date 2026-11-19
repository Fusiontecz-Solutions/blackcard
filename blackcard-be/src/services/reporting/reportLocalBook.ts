/**
 * Single-tenant book CRM: reporting facts still use bookId for schema parity
 * with Super Admin. Each CRM DB has one stub Book row.
 */
import prisma from '../../config/prismaClient';

/** Stable UUID — unique per database, same constant across books is fine. */
export const LOCAL_BOOK_ID =
  process.env.REPORT_BOOK_ID?.trim() ||
  '00000000-0000-4000-8000-000000000001';

export function localBookMeta() {
  const code = (process.env.BOOK_CODE || process.env.REPORT_BOOK_CODE || 'blackcard')
    .trim()
    .toLowerCase() || 'local';
  const name =
    process.env.BOOK_NAME?.trim() ||
    process.env.REPORT_BOOK_NAME?.trim() ||
    'Blackcard' ||
    code.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { id: LOCAL_BOOK_ID, code, name };
}

/** Ensure the stub Book row exists before sync / FK writes. */
export async function ensureLocalBook(): Promise<{ id: string; code: string; name: string }> {
  const meta = localBookMeta();
  await prisma.book.upsert({
    where: { id: meta.id },
    create: {
      id: meta.id,
      name: meta.name,
      code: meta.code,
      domain: process.env.BOOK_DOMAIN?.trim() || '',
      apiBaseUrl: '',
      status: true,
    },
    update: {
      name: meta.name,
      code: meta.code,
      status: true,
    },
  });
  return meta;
}
