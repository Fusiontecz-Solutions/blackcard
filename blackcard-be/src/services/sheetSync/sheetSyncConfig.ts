/**
 * Per-book settings for syncing deals + payments from the book's own Google Sheet (or an .xlsx
 * download of it). Everything sheet-specific lives here so the sync logic stays the same for
 * every book: only tab names, header aliases and syndicator names differ.
 */

export type SheetSyncConfig = {
    /** Tab holding one row per deal, with syndicator % columns. */
    dealsTab: string;
    /** Tab holding one row per bank transaction (payments and bounces). */
    paymentsTab: string;
    /** Rows after the header to skip before deal data starts (e.g. a totals row). */
    dealsSkipRowsAfterHeader: number;
    /**
     * Sheet header → deal import field. Keys are matched after lower-casing and stripping
     * everything but letters/digits, so "Deal Name " and "deal name" are the same header.
     */
    dealColumns: Record<string, DealField>;
    /** Fields found by column position instead of header, e.g. a Deal ID column with a blank header (0 = column A). */
    dealColumnPositions?: Partial<Record<DealField, number>>;
    /**
     * Headers that are never syndicators even when their values look like percentages
     * (formula / summary columns). Same normalisation as `dealColumns`.
     */
    nonSyndicatorColumns: string[];
    /**
     * Sheet syndicator column → CRM syndicator name, for columns whose header differs from the
     * CRM name. Columns not listed here must match a CRM syndicator by name.
     */
    syndicatorAliases: Record<string, string>;
    paymentColumns: {
        date: string;
        description: string;
        debit: string;
        credit: string;
        amount: string;
        dealId: string;
        returnDate: string;
    };
};

export type DealField =
    | 'dealId'
    | 'dealName'
    | 'date'
    | 'type'
    | 'status'
    | 'offer'
    | 'rate'
    | 'commission'
    | 'refinanceAmount'
    | 'repayPerPeriod'
    | 'term'
    | 'iso';

export const BLACKCARD_SHEET_SYNC_CONFIG: SheetSyncConfig = {
    dealsTab: 'Main Sheet-New',
    paymentsTab: 'PMT',
    // Row 2 of "Main Sheet-New" is the portfolio totals row.
    dealsSkipRowsAfterHeader: 1,
    // Column A holds the Deal ID (BK1001…) but its header cell is blank.
    dealColumnPositions: { dealId: 0 },
    dealColumns: {
        deal: 'dealId',
        dealname: 'dealName',
        date: 'date',
        type: 'type',
        status: 'status',
        funding: 'offer',
        factor: 'rate',
        com: 'commission',
        refi: 'refinanceAmount',
        daily: 'repayPerPeriod',
        term: 'term',
        isorep: 'iso',
    },
    // Formula columns on "Main Sheet-New": recomputed by the CRM from payments, never imported.
    nonSyndicatorColumns: [
        'payback',
        'livefunding',
        'livepayback',
        'livebankfee',
        'livenet',
        'actualdaily',
        'balance',
        'paid',
        'aboveprincipal',
        'od',
        'total',
        'notes',
    ],
    syndicatorAliases: {},
    paymentColumns: {
        date: 'Date',
        description: 'Description',
        debit: 'Debit',
        credit: 'Credit',
        amount: 'Amount',
        dealId: 'Type',
        returnDate: 'Bounce Date',
    },
};

/** Lower-case and keep only letters/digits: "Deal Name " → "dealname", "% Paid " → "paid". */
export function normalizeSheetHeader(header: unknown): string {
    return String(header ?? '')
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[^a-z0-9]+/g, '');
}
