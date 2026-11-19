/**
 * Built-in letter templates with Data Personalization field metadata.
 * Kept in sync with FE PayOffLetter / ZeroBalanceLetter / Payoff Wire variable lists.
 * HTML bodies are API-safe copies of the frontend branded layouts.
 */

import { getBuiltinLetterTemplateBody } from './letterTemplateBodies';

export type LetterTemplateField = {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
};

export type BuiltinLetterTemplate = {
  id: string;
  name: string;
  /** When set, template is only returned for that funder filter. Null = all funders. */
  funder: string | null;
  category: 'letter';
  source: 'builtin';
  status: 'active';
  fields: LetterTemplateField[];
  variables: string[];
  /** Optional HTML body stub; branded letters render on the frontend. */
  body: string;
  description?: string;
};

const PAYOFF_NOTE_DEFAULT =
  'Payoff amount is valid through the above date';

const PAYOFF_LETTER_FIELDS: LetterTemplateField[] = [
  { key: 'deal_id', label: 'Deal ID', placeholder: 'BCF12345' },
  {
    key: 'letter_date',
    label: 'Letter Date',
    placeholder: 'May 20, 2024',
    defaultValue: 'May 20, 2024',
  },
  {
    key: 'recipient_salutation',
    label: 'Recipient',
    placeholder: 'To Whom It May Concern',
    defaultValue: 'To Whom It May Concern',
  },
  {
    key: 'account_name',
    label: 'Merchant Name',
    placeholder: 'Acme LLC',
    defaultValue: 'Acme LLC',
  },
  {
    key: 'payoff_amount',
    label: 'Amount',
    placeholder: '$5,678.90',
    defaultValue: '$5,678.90',
  },
  {
    key: 'note',
    label: 'Note',
    placeholder: PAYOFF_NOTE_DEFAULT,
    defaultValue: PAYOFF_NOTE_DEFAULT,
  },
  {
    key: 'good_through_date',
    label: 'Valid Till',
    placeholder: 'May 27, 2024',
    defaultValue: 'May 27, 2024',
  },
  {
    key: 'lender_name',
    label: 'Lender Name',
    placeholder: 'Black Card LLC',
    defaultValue: 'Black Card LLC',
  },
  {
    key: 'payment_company_name',
    label: 'Bank Name',
    placeholder: 'Optimum Bank',
    defaultValue: 'Optimum Bank',
  },
  {
    key: 'payment_address_line1',
    label: 'Payment Address Line 1',
    placeholder: 'Street address',
  },
  {
    key: 'payment_address_line2',
    label: 'Payment Address Line 2',
    placeholder: 'City ST ZIP',
  },
  {
    key: 'payment_routing_number',
    label: 'Routing Number',
    placeholder: 'Routing number',
  },
  {
    key: 'payment_account_number',
    label: 'Payment Account Number',
    placeholder: 'Account number',
  },
  {
    key: 'sender_name',
    label: 'Sender Name',
    placeholder: 'Admin Team',
    defaultValue: 'Admin Team',
  },
];

const ZERO_BALANCE_LETTER_FIELDS: LetterTemplateField[] = [
  { key: 'deal_id', label: 'Deal ID', placeholder: 'BCF12345' },
  {
    key: 'letter_date',
    label: 'Letter Date',
    placeholder: '05/20/2024',
    defaultValue: '05/20/2024',
  },
  {
    key: 'account_name',
    label: 'Merchant Name',
    placeholder: 'Acme LLC',
    defaultValue: 'Acme LLC',
  },
  {
    key: 'salutation_name',
    label: 'Salutation Name',
    placeholder: 'John Doe',
    defaultValue: 'John Doe',
  },
  {
    key: 'date_of_funding',
    label: 'Date of Funding',
    placeholder: '05/20/2024',
    defaultValue: '05/20/2024',
  },
  {
    key: 'account_status',
    label: 'Status',
    placeholder: 'Zero Balance',
    defaultValue: 'Zero Balance',
  },
  {
    key: 'sender_name',
    label: 'Sender Name',
    placeholder: 'Admin Team',
    defaultValue: 'Admin Team',
  },
];

const PAYOFF_WIRE_FIELDS: LetterTemplateField[] = [
  { key: 'deal_id', label: 'Deal ID', placeholder: 'BCF12345' },
  { key: 'letter_date', label: 'Letter Date', placeholder: '05/20/2024' },
  { key: 'account_name', label: 'Merchant Name', placeholder: 'Acme LLC' },
  { key: 'payoff_amount', label: 'Amount', placeholder: '$5,678.90' },
  {
    key: 'note',
    label: 'Note',
    placeholder: PAYOFF_NOTE_DEFAULT,
    defaultValue: PAYOFF_NOTE_DEFAULT,
  },
  { key: 'good_through_date', label: 'Valid Till', placeholder: '05/27/2024' },
  {
    key: 'lender_name',
    label: 'Lender Name',
    placeholder: 'Black Card LLC',
    defaultValue: 'Black Card LLC',
  },
  {
    key: 'payment_company_name',
    label: 'Bank Name',
    placeholder: 'Optimum Bank',
    defaultValue: 'Optimum Bank',
  },
  {
    key: 'payment_address_line1',
    label: 'Payment Address Line 1',
    placeholder: 'Street address',
  },
  {
    key: 'payment_address_line2',
    label: 'Payment Address Line 2',
    placeholder: 'City ST ZIP',
  },
  {
    key: 'payment_routing_number',
    label: 'Routing Number',
    placeholder: 'Routing number',
  },
  {
    key: 'payment_account_number',
    label: 'Account Number',
    placeholder: 'Account number',
  },
  {
    key: 'sender_name',
    label: 'Sender Name',
    placeholder: 'Admin Team',
    defaultValue: 'Admin Team',
  },
];

function withVariables(fields: LetterTemplateField[]): string[] {
  return fields.map((f) => f.key);
}

function withBody(
  template: Omit<BuiltinLetterTemplate, 'body' | 'variables'>,
): BuiltinLetterTemplate {
  return {
    ...template,
    variables: withVariables(template.fields),
    body:
      getBuiltinLetterTemplateBody(template.id) ??
      getBuiltinLetterTemplateBody(`builtin-fe:${template.id.replace(/^builtin:/, '')}`) ??
      '',
  };
}

/** Application built-in letter catalog (full field metadata for Data Personalization). */
export const BUILTIN_LETTER_TEMPLATES: BuiltinLetterTemplate[] = [
  withBody({
    id: 'builtin:payoff-letter',
    name: 'Payoff Letter',
    funder: null,
    category: 'letter',
    source: 'builtin',
    status: 'active',
    fields: PAYOFF_LETTER_FIELDS,
    description:
      'Payoff letter with wire instructions — branded email layout used for outbound sends.',
  }),
  withBody({
    id: 'builtin:zero-balance-letter',
    name: 'Zero Balance Letter',
    funder: null,
    category: 'letter',
    source: 'builtin',
    status: 'active',
    fields: ZERO_BALANCE_LETTER_FIELDS,
    description:
      'Zero balance confirmation letter — branded email layout used for outbound sends.',
  }),
  withBody({
    id: 'builtin:payoff-wire-instructions',
    name: 'Payoff Wire Instructions',
    funder: null,
    category: 'letter',
    source: 'builtin',
    status: 'active',
    fields: PAYOFF_WIRE_FIELDS,
    description:
      'Wire destination sheet for a merchant payoff — same personalization as the Payoff letter.',
  }),
];

export function getBuiltinLetterTemplates(): BuiltinLetterTemplate[] {
  return BUILTIN_LETTER_TEMPLATES.map((t) => ({
    ...t,
    fields: t.fields.map((f) => ({ ...f })),
    variables: [...t.variables],
  }));
}

export function getBuiltinLetterTemplateById(
  id: string,
): BuiltinLetterTemplate | undefined {
  const normalized = String(id ?? '').trim();
  if (!normalized) return undefined;
  const feAlias = normalized.startsWith('builtin-fe:')
    ? `builtin:${normalized.slice('builtin-fe:'.length)}`
    : normalized;
  return getBuiltinLetterTemplates().find(
    (t) => t.id === normalized || t.id === feAlias,
  );
}
