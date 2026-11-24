# Blackcard Google Sheet → CRM mapping

One-way, once a day: the Google Sheet is the source, the CRM follows it. Results show in
**All Deals** (`/payments`): the deals table, dashboard totals, each deal's page and
**Failed Transactions**.

Config: `sheetSyncConfig.ts` (`BLACKCARD_SHEET_SYNC_CONFIG`). Logic: `sheetSyncService.ts`.

## Tabs read

| Tab | Role |
|---|---|
| `Main Sheet-New` | Deals, one row per deal (required). Row 2 is the totals row and is skipped. |
| `PMT` | Payments and returns, one row per bank transaction (required). |
| `Main Sheet` | Fills blanks on `Main Sheet-New` by Deal ID: only *Contract Daily* today (optional). |
| `Bank1` | Bank ledger: funding wires and ISO commission payouts per deal (optional). |

All other tabs are views, filters or accounting reports built from these and are not read
(see "Not synced" below).

## Main Sheet-New → deal (Application + OfferDecision)

| Sheet column | CRM field | Notes |
|---|---|---|
| A (blank header) | Deal ID (`application.dealId`) | `BK1001`…; the match key. |
| Date | Funded date (`createdAt`) | |
| Deal Name | Deal / business name | |
| Type | Type | MCA / REVERSE / REFI |
| Status | Status | FUNDED → BOUNCING DEBITS → DEFAULT → LEGAL → PAID IN FULL / CANCELLED; never moves backwards. |
| Funding | Funded amount (`loanAmount`, `offer`) | An existing different amount is reported, not overwritten. |
| Factor | Factor rate (`rate`) | |
| Com | Commission | |
| live Bank Fee | Fees (`offerDecision.fees`) | |
| ReFi | Refinance amount | |
| Daily | Daily/weekly payment (`repayPerPeriod`) | Empty on this tab; taken from **Main Sheet → Contract Daily**. |
| Term | Term ("40 Days", "25 Weeks") | Sets frequency. |
| ISO rep | ISO | |
| House, Barclay2, 2…10 | Syndicator split | Fractions (1 = 100%); must total 100%. Column name must match a CRM syndicator. Only filled on deals with no split yet; a different split is reported. |
| Payback | Payback (`offerDecision.totalRemit`) | Computed as Funding × Factor (matches the sheet on all 127 sample deals). Needed for balances. |

Calculated by the CRM from payments, so not imported: Live Funding, Live Payback, Live Net,
Actual Daily, Balance, % Paid, Above Principal, Paid, OD.

Every sheet deal is placed in the **Funded** queue so All Deals lists it (new deals are created
there; matched deals in another queue are moved).

## PMT → payment (`collectionPayment`)

| Sheet column | CRM field | Notes |
|---|---|---|
| Date | Payment date | |
| Description | Notes | e.g. "R01 Insufficient Funds …" |
| Credit | status `CREDIT` | Money received. |
| Debit | status `DEBIT` | Return / bounce; listed on Failed Transactions. |
| Amount | Amount | Signed. |
| Type | Deal ID | Links the payment to the deal. |
| Bounce Date | Return date | Formula errors (`#VALUE!`) are ignored. |

Payments already in the CRM (same deal, date, amount, status, description) are skipped, so
re-running the sync is safe.

## Bank1 → funding & commission (`DealLedgerEntry`)

Rows whose **Type** is `Funding` or `Commission` and whose **Account** is a Deal ID.
Shown on the deal page in All Deals → **Funding & Commission** tab
(API: `GET /collection-payments/deal-ledger/:applicationId`).

| Sheet column | CRM field | Notes |
|---|---|---|
| Date | `entryDate` | |
| Description | `description` | |
| Amount | `amount` | Sign flipped: money paid out is positive; a returned wire (e.g. R03) is negative. |
| Account | `dealId` → deal | |
| Type | `kind` | `Funding` → FUNDING, `Commission` → COMMISSION. |

- The sheet is the source: entries missing from the CRM are added, and synced entries no longer
  on the sheet are removed (only for deals on the deals tab).
- When commission paid ≥ the deal's **Com** (Main Sheet-New), the deal's ISO payout moves from
  PENDING to **PAID**, dated the last commission payment. PAID / CLAWBACKS are never changed.
- Sample check: 201 funding wires ($1,825,909.90) and 198 commission payouts ($191,874.99,
  equal to the sheet's total Com); 98 deals fully paid.

## Matching and safety

- Deals match by Deal ID; a CRM deal without one is matched by name + funded amount (+ date)
  and gets the sheet's Deal ID. Anything ambiguous is reported as a conflict and left alone.
- Dry run by default. Writes need `SHEET_SYNC_PUSH_APPLY=true`, `SHEET_SYNC_ALLOW_WRITE_HOST`
  equal to the database host, and `SHEET_SYNC_ACTOR_USER_ID`.

## Not synced (yet)

| Tab | Content | Possible CRM use |
|---|---|---|
| `Com` | Per-deal commission summary (Paid$ equals Bank1 commission on all deals; no clawbacks or status filled) | Covered by Bank1; read if clawbacks start being used. |
| `OtherAccount` | Renewal payoffs moved between deals | Already covered: the payoff credit is in PMT and the amount is the ReFi column. |
| `Bank1` (other types) | Loans, bank fees, payroll, transfers | Company accounting, not deal data. |
| `JournalEntry`, `FS1*`, `Cash-Flow`, `Balance`, `HouseBalance`, `Barclay2B` | Company accounting | Not deal data. |
| `Deal Detail*`, `FlexReverse Detail`, `Com-Request`, `Filter*`, `Code`, `Big2`, `All`, `House`, `Barclay2`, `3`–`15` | Views/lookups of the tabs above | Nothing extra to sync. |
| `Customer List`, `Flex`, `Funding`, `Bank-2`…`Bank-10` | Empty in the sample | — |
