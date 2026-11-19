import prisma from '../config/prismaClient';
import { PaymentTemplateType } from '@prisma/client';
import {
  getBuiltinLetterTemplateById,
  getBuiltinLetterTemplates,
  type LetterTemplateField,
} from './letterTemplateCatalog';

export type LetterTemplateSource = 'builtin' | 'database';

export type LetterTemplateDto = {
  id: string;
  name: string;
  funder: string | null;
  category: 'letter';
  source: LetterTemplateSource;
  status: string;
  fields: LetterTemplateField[];
  variables: string[];
  body: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ListLetterTemplatesOptions = {
  funder?: string;
  status?: string;
  includeBuiltin?: boolean;
  includeDatabase?: boolean;
};

function parseBoolQuery(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null || value === '') return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (s === 'false' || s === '0' || s === 'no') return false;
  if (s === 'true' || s === '1' || s === 'yes') return true;
  return defaultValue;
}

export function parseListLetterTemplatesQuery(query: Record<string, unknown>): ListLetterTemplatesOptions {
  const funderRaw =
    typeof query.funder === 'string' ? query.funder.trim() : '';
  const statusRaw =
    typeof query.status === 'string' ? query.status.trim() : '';

  return {
    funder: funderRaw || undefined,
    status: statusRaw || undefined,
    includeBuiltin: parseBoolQuery(query.includeBuiltin, true),
    includeDatabase: parseBoolQuery(query.includeDatabase, true),
  };
}

/** Ordered unique `{{placeholder}}` keys from template body. */
export function placeholderKeysFromBody(body: string): string[] {
  const re = /\{\{\s*([^}]+?)\s*\}\}/g;
  const seen = new Set<string>();
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const k = m[1].trim();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Merge declared variables + body placeholders into ordered unique keys. */
export function mergeVariableKeys(
  variables: string[] | null | undefined,
  body: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const k = String(raw ?? '').trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  for (const k of placeholderKeysFromBody(body)) push(k);
  for (const k of variables ?? []) push(String(k ?? ''));
  return out;
}

export function fieldsFromVariableKeys(keys: string[]): LetterTemplateField[] {
  return keys.map((key) => ({
    key,
    label: humanizeKey(key),
  }));
}

function normalizeFunderToken(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function matchesFunderFilter(
  templateFunder: string | null | undefined,
  filter: string | undefined,
): boolean {
  if (!filter) return true;
  const tf = normalizeFunderToken(templateFunder);
  // Global / unscoped templates are available for every funder.
  if (!tf) return true;
  return tf === normalizeFunderToken(filter);
}

function matchesStatusFilter(
  templateStatus: string | null | undefined,
  filter: string | undefined,
): boolean {
  if (!filter) return true;
  return (
    String(templateStatus ?? '')
      .trim()
      .toLowerCase() === filter.trim().toLowerCase()
  );
}

function isLegacyBrandedLetterName(name: string): boolean {
  const n = String(name || '')
    .trim()
    .toLowerCase();
  return (
    n === 'zero balance letter' ||
    n.includes('zero balance') ||
    n.includes('payoff') ||
    n.includes('pay off') ||
    n.includes('wire')
  );
}

function toIso(value: Date | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.toISOString();
}

async function loadDatabaseLetterTemplates(
  options: ListLetterTemplatesOptions,
): Promise<LetterTemplateDto[]> {
  const where: {
    category: PaymentTemplateType;
    status?: string;
  } = {
    category: PaymentTemplateType.letter,
  };
  if (options.status) {
    where.status = options.status;
  }

  const rows = await prisma.paymentTemplate.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  });

  return rows
    .filter((row) => !isLegacyBrandedLetterName(row.name))
    .map((row) => {
      const variables = mergeVariableKeys(row.variables, row.body);
      return {
        id: row.id,
        name: row.name,
        funder: null,
        category: 'letter' as const,
        source: 'database' as const,
        status: row.status,
        fields: fieldsFromVariableKeys(variables),
        variables,
        body: row.body,
        createdAt: toIso(row.createdAt),
        updatedAt: toIso(row.updatedAt),
      };
    })
    .filter((t) => matchesFunderFilter(t.funder, options.funder));
}

function loadBuiltinLetterTemplates(
  options: ListLetterTemplatesOptions,
): LetterTemplateDto[] {
  return getBuiltinLetterTemplates()
    .filter((t) => matchesStatusFilter(t.status, options.status))
    .filter((t) => matchesFunderFilter(t.funder, options.funder))
    .map((t) => ({
      id: t.id,
      name: t.name,
      // Echo requested funder on global built-ins so clients can bind UI context.
      funder: t.funder ?? (options.funder ? options.funder : null),
      category: 'letter' as const,
      source: 'builtin' as const,
      status: t.status,
      fields: t.fields,
      variables: t.variables,
      body: t.body,
      description: t.description,
    }));
}

export async function listLetterTemplates(
  options: ListLetterTemplatesOptions = {},
): Promise<LetterTemplateDto[]> {
  const includeBuiltin = options.includeBuiltin !== false;
  const includeDatabase = options.includeDatabase !== false;

  const builtin = includeBuiltin ? loadBuiltinLetterTemplates(options) : [];
  const database = includeDatabase
    ? await loadDatabaseLetterTemplates(options)
    : [];

  // Built-ins first (stable catalog), then DB templates.
  return [...builtin, ...database];
}

export async function getLetterTemplateById(
  id: string,
  options: Pick<ListLetterTemplatesOptions, 'funder'> = {},
): Promise<LetterTemplateDto | null> {
  const normalized = String(id ?? '').trim();
  if (!normalized) return null;

  const builtin = getBuiltinLetterTemplateById(normalized);
  if (builtin) {
    if (!matchesFunderFilter(builtin.funder, options.funder)) return null;
    return {
      id: builtin.id,
      name: builtin.name,
      funder: builtin.funder ?? (options.funder ? options.funder : null),
      category: 'letter',
      source: 'builtin',
      status: builtin.status,
      fields: builtin.fields,
      variables: builtin.variables,
      body: builtin.body,
      description: builtin.description,
    };
  }

  const row = await prisma.paymentTemplate.findFirst({
    where: {
      id: normalized,
      category: PaymentTemplateType.letter,
    },
  });
  if (!row) return null;

  const variables = mergeVariableKeys(row.variables, row.body);
  const dto: LetterTemplateDto = {
    id: row.id,
    name: row.name,
    funder: null,
    category: 'letter',
    source: 'database',
    status: row.status,
    fields: fieldsFromVariableKeys(variables),
    variables,
    body: row.body,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };

  if (!matchesFunderFilter(dto.funder, options.funder)) return null;
  return dto;
}
