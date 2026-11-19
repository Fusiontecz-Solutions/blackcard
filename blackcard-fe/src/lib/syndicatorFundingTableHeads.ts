/** Shared syndicator funding table column headers (dashboard + funding page). */
export type SyndicatorFundingTableHeadDef = {
  id: string;
  label: string;
  className?: string;
};

export const SYNDICATOR_FUNDING_TABLE_HEADS: SyndicatorFundingTableHeadDef[] = [
  { id: 'dealId', label: 'DEAL ID' },
  { id: 'merchant', label: 'MERCHANT NAME' },
  { id: 'company', label: 'COMPANY NAME' },
  { id: 'start', label: 'START DATE' },
  { id: 'end', label: 'END DATE', className: 'min-w-[7.5rem]' },
  { id: 'syndicateAmt', label: 'SYNDICATE AMOUNT' },
  { id: 'syndPayback', label: 'SYNDICATED PAYBACK' },
  { id: 'commission', label: 'COMMISSION' },
  { id: 'managementFee', label: 'MANAGEMENT FEE' },
  { id: 'collected', label: 'COLLECTED' },
  { id: 'remaining', label: 'REMAINING' },
  { id: 'participation', label: 'PARTICIPATION' },
];
