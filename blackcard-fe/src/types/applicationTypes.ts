// Application Types

/** Populated user shape from API (`mapUserLite`); `role` included when the backend selects it (e.g. list `createdBy`). */
export type ApplicationUserLite = {
    _id?: string;
    id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    role?: string;
};

/** Populated ISO on application list/detail (`mapApplicationToApi` includes `iso: true`). */
export type ApplicationIsoLite = {
    _id?: string;
    id?: string;
    name?: string;
    email?: string | null;
};

/** Minimal bank row used by Decision Logic widgets. */
export type BankInformation = {
    id: number;
    bankName?: string | null;
    routingNumber?: string | null;
    accountNumber?: string | null;
};

/** Minimal owner row used by Decision Logic widgets. */
export type OwnerProfile = {
    id: number;
    firstName?: string | null;
    lastName?: string | null;
};

export interface Application {
    _id: string;
    /** External / import deal identifier (e.g. Excel). Distinct from autoincrement `applicationId`. */
    dealId?: string | null;
    /** Derived during bulk import from `dealId` prefix when organization tagging is enabled. */
    organization?: string | null;
    applicationId?: number;
    priority: 'Low' | 'Medium' | 'High' | 'Urgent';
    type: 'New' | 'Renewal' | 'Modification';
    referringAgent?: string | ApplicationUserLite;
    /** Linked ISO (independent sales org), when set on the application. */
    iso?: ApplicationIsoLite | null;
    salesRepresentative: string;
    client: string | {
        _id: string;
        clientId?: number;
        business?: {
            name?: string;
            email?: string;
            address?: import("./clientTypes").Address;
        };
        owner?: {
            firstName?: string;
            lastName?: string;
            email?: string;
            address?: import("./clientTypes").Address;
        };
    };
    loanAmount?: number | null;
    /** Latest terms offer (list/detail when backend includes relations). */
    termsOffers?: { approvedAmount?: number | string | null }[];
    /** Offer decision snapshot (list/detail when backend includes relations). */
    OfferDecision?: {
        offer?: number | string | Record<string, unknown> | null;
        decision?: string | null;
        declineReason?: string | null;
    } | null;
    /** Per-row import / Excel deal name when distinct from client business name (e.g. "… #2"). */
    dealDisplayName?: string | null;
    note?: string;
    files?: ApplicationFiles[];
    documentChecklistChecked?: string[];
    status?: 'Pending' | 'Approved' | 'Rejected' | 'Funded';
    queue?: string;
    state?: string;
    currentQueue?: 'New' | 'Agent' | 'Review' | 'Scrubbing' | 'Underwriter' | 'Underwriting' | 'Final Review' | 'Final Approval' | 'Approved' | 'Declined' | 'On Hold' | 'Contracted' | 'Contract Out' | 'Contracts Out' | 'fake Application';
    currentState?: 'Draft' | 'Pending' | 'Submitted' | 'In Progress' | 'Completed' | 'Cancelled' | 'Contract Out' | 'Contracts Out';
    /** Raw DB state (Prisma) when present — `currentState` is workflow-mapped and can collapse funded vs approved. */
    statsCurrentState?: string;
    /** Application-level commission rate (0–100), persisted on the application record. */
    commissionPercentage?: number;
    /** Per-deal underwriter commission rate (0–100), distinct from ISO commission. */
    underwriterCommissionPercentage?: number;
    /** Per-deal broker commission rate (0–100), set at disbursement. */
    brokerCommissionPercentage?: number;
    /** Per-deal commission dollars (e.g. bulk import); used with advance/fees for “already net” style metrics. */
    commissionAmount?: number | null;
    underwriterCommissionAmount?: number | null;
    brokerCommissionAmount?: number | null;
    /** Ops-entered broker name at disbursement. */
    brokerName?: string | null;
    /** Ops-entered underwriter name at disbursement. */
    underwriterCommissionName?: string | null;
    /** Set on `GET /applications?statsBucket=funded`: collection payback/repaid/balance (same logic as `/collection-payments/balances`). */
    collectionPaybackAmount?: number | null;
    collectionSumOfRepaid?: number | null;
    /** Deal Economics REPaid gross (credit+paid+manual−debits); aligns portfolio Recovered totals with Deal Economics tiles. */
    collectionGrossRepaidDealEconomics?: number | null;
    collectionBalanceDue?: number | null;
    createdBy?: string | ApplicationUserLite;
    assignedTo?: string;
    claimedByUnderwriterId?: string | null;
    claimedAt?: string | null;
    /** Set when the deal was soft-deleted (Recently Deleted). */
    deletedAt?: string | null;
    deletedById?: string | null;
    claimedByUnderwriter?: ApplicationUserLite | null;
    assignedUnderwriterId?: string | null;
    assignedUnderwriter?: ApplicationUserLite | null;
    approvedByUnderwriterId?: string | null;
    approvedAt?: string | null;
    approvedByUnderwriter?: ApplicationUserLite | null;
    /** Last action the Underwriter took: "Approved By UW", "Decline by UW", "Final Approved by UW". */
    underwriterAction?: string | null;
    /** Scrubber's recommendation from the compliance-check modal: "Recommend Approval" or "Recommend Decline". */
    scrubberRecommendation?: string | null;
    /** Operations-set payment health category (e.g. "Weekly Payments", "Insufficient Funds"). */
    category?: string | null;
    /** UW updated offer after contract generation — requires ISO re-approval and contract regeneration. */
    needsContractReinitiation?: boolean;
    /** ISO approved the updated offer while {@link needsContractReinitiation} is true. */
    isoUpdatedOfferApproved?: boolean;
    /** Underwriter marked ISO comments as resolved — removes deal from ISO Query pipeline. */
    isoQueryResolved?: boolean;
    /** Tab that sent the deal to Final Approval: "Decision Logic" or "Funding Call". */
    finalApprovalSource?: 'Decision Logic' | 'Funding Call' | null;
    /** True when another live deal shares the same EIN or owner SSN. */
    isDuplicate?: boolean;
    /** Set while an Underwriter has sent the deal back to the scrubber for correction. */
    returnedToScrubberAt?: string | null;
    /** Scrubber the deal was returned to. */
    returnedToScrubberId?: string | null;
    /** Underwriter who returned it; the corrected deal goes back to this person. */
    returnedByUnderwriterId?: string | null;
    returnedByUnderwriter?: ApplicationUserLite | null;
    /** "|||"-delimited correction reasons chosen by the Underwriter. */
    returnReasons?: string | null;
    /** Underwriter note describing what must be corrected. */
    returnNote?: string | null;
    createdAt?: string;
    updatedAt?: string;
}

export interface ApplicationFiles {
    _id?: string;
    url?: string;
    publicId?: string;
    originalName?: string;
    size?: number;
    uploadedAt?: string;
    type?: string;
    mimeType?: string;
    requestedDocumentSlug?: string | null;
    documentType?: string | null;
}

export interface CreateApplicationPayload {
    priority: string;
    type: string;
    referringAgent?: string;
    salesRepresentative: string;
    client: string;
    loanAmount?: number | string | null;
    note?: string;
    documents?: File[];
}

export interface UpdateApplicationPayload {
    priority?: string;
    type?: string;
    referringAgent?: string;
    salesRepresentative?: string;
    client?: string;
    loanAmount?: number | string | null;
    note?: string;
    currentQueue?: string;
    currentState?: string;
    status?: string;
    underwriterApproval?: boolean;
    approvedAt?: string;
    commissionPercentage?: number;
    underwriterCommissionPercentage?: number;
    brokerCommissionPercentage?: number;
    /** Dollar commission stored on the application row (`Application.commissionAmount`). */
    commissionAmount?: number | null;
    /** Dollar underwriter commission stored on the application row. */
    underwriterCommissionAmount?: number | null;
    /** Dollar broker commission stored on the application row. */
    brokerCommissionAmount?: number | null;
    /** Ops-entered broker display name at disbursement. */
    brokerName?: string | null;
    /** Ops-entered underwriter display name at disbursement. */
    underwriterCommissionName?: string | null;
    /** Links the deal to an ISO; backend validates and syncs commission from the ISO record. */
    isoId?: string | null;
    /** Operations-set payment health category (e.g. "Weekly Payments", "Insufficient Funds"); pass null/"" to clear. */
    category?: string | null;
    /** Mark ISO comment thread as resolved (removes from ISO Query pipeline). */
    isoQueryResolved?: boolean;
}

export interface UpdateQueuePayload {
    currentQueue: string;
    /** Scrubber's recommendation captured on the compliance-check modal ("Recommend Approval" / "Recommend Decline"). */
    scrubberRecommendation?: string;
    /** Optional CC recipients for scrubber → UW or underwriter-approve → ISO mail. */
    ccEmails?: string[];
    /** Optional ISO To override when underwriter approves (ISO approval mail). */
    isoEmail?: string;
    /** Scrubber's reasons with "Recommend Decline" (preselected when Super Admin declines). */
    declineReasons?: string[];
    /** Scrubbing preview PDF (base64) the API attaches to the recommend mail as Breakdown.pdf. */
    breakdownPdf?: string;
    /** Mail To confirmed in the popup (scrubber decline / underwriter decision → submissions inbox). */
    toEmails?: string[];
}

export interface UpdateStatePayload {
    currentState: string;
}

export interface ApplicationsResponse {
    success: boolean;
    data: Application[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface ApplicationResponse {
    success: boolean;
    data: Application;
}

export interface GetApplicationsParams {
    /** When true, `getApplications` skips read/write of the client list cache (e.g. deal details). */
    skipListCache?: boolean;
    /** When true, skip cache read but still persist the response (forces a network round-trip). */
    skipListCacheRead?: boolean;
    /** When true, clear list on pending so stale rows are not shown while loading (main / browse lists). */
    clearListOnFetch?: boolean;
    /**
     * When true, fetches consecutive pages with the same filters until a short page is returned,
     * then merges rows.
     */
    fetchAllPages?: boolean;
    /** Overrides axios timeout (ms) for large list responses (default client timeout is 120s). */
    requestTimeoutMs?: number;
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    /** Dashboard stat cards — same buckets as `/applications/stats` aggregation */
    statsBucket?: string;
    operationsStatus?: string;
    priority?: string;
    type?: string;
    clientId?: string;
    currentQueue?: string;
    currentState?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    /** When true, backend returns list-optimized payload (smaller includes, faster response). */
    lite?: boolean;
    /** SCRUBBING / UNDERWRITER: narrow list to Queue / Claimed / My deals. */
    underwriterClaim?: 'unclaimed' | 'claimed' | 'mine';
    /** 1 = only deals an Underwriter sent back to the scrubber for correction. */
    returnedForCorrection?: 1;
    /** UNDERWRITER: sidebar pipeline drill-down scoped to the logged-in underwriter. */
    underwriterPipeline?: string;
    /** Organization filter for list table. */
    organization?: string;
    /** SUPER_ADMIN / OPERATIONS: filter by scrubbing-stage claim (`claimedByUnderwriterId`). */
    claimedByUnderwriterId?: string;
    /** SUPER_ADMIN / OPERATIONS: filter by underwriter assignment. */
    assignedUnderwriterId?: string;
    /** Filter by Application.createdAt (YYYY-MM-DD, Eastern calendar day). */
    startDate?: string;
    endDate?: string;
}

