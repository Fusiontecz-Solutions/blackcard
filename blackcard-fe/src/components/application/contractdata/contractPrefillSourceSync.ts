import type { ClientUpdatePayload, OwnerDetail } from "@/types/clientTypes";
import type { BuildContractPrefillFieldsArgs } from "./Contract";
import { sanitizePaymentFrequencyForPersist } from "./Contract";
import type { UpdateBankDetailPayload } from "@/types/bankDetailTypes";
import { parseNumberUS } from "@/lib/utils";
import { recalculateOfferFields } from "@/lib/offerRepaymentCalculations";
import type { AppDispatch } from "@/redux/store";
import { getApplicationById } from "@/redux/actions/applicationActions";
import { getClientById, updateClient } from "@/redux/actions/clientActions";
import { resetUpdateClient } from "@/redux/slices/clientSlice";
import { getOfferDecisionByApplication } from "@/redux/actions/offerDecisionActions";
import {
    updateACH,
    updateContractGuarantor,
    updateContractOwner,
} from "@/redux/actions/contractActions";
import { getBankDetails, updateBankDetail } from "@/redux/actions/bankDetailActions";
import { axiosPost } from "@/redux/axios";
import { emitOfferDecisionUpdated } from "@/lib/offerDecisionSync";

function str(v: unknown): string {
    return String(v ?? "").trim();
}

function parseMoney(v: unknown): number | null {
    if (v == null || v === "") return null;
    const n = parseNumberUS(v);
    return Number.isFinite(n) ? n : null;
}

/** Same resolution as OfferDecisionToggle / approval modal. */
export function resolveApplicationIdForOfferDecision(anyApp: unknown): string | null {
    const a = anyApp as Record<string, unknown> | null | undefined;
    if (!a) return null;
    const id = a.applicationId ?? a._id ?? a.id;
    return id != null && str(id) ? String(id) : null;
}

export function resolveApplicationUuidForUpdate(anyApp: unknown): string | null {
    const a = anyApp as Record<string, unknown> | null | undefined;
    if (!a) return null;
    const id = a._id ?? a.id;
    return id != null && str(id) ? String(id) : null;
}

export function resolveClientIdFromApplication(anyApp: unknown): string | null {
    const a = anyApp as Record<string, unknown> | null | undefined;
    if (!a) return null;
    const client = a.client as Record<string, unknown> | undefined;
    const fromClient = client?.id ?? client?._id;
    if (fromClient != null && str(fromClient)) return String(fromClient);
    const fromApp = a.clientId;
    // Prefer Mongo/UUID client ids; skip numeric application refs mistaken for clientId.
    if (fromApp != null && str(fromApp) && !/^\d+$/.test(String(fromApp))) {
        return String(fromApp);
    }
    return null;
}

function splitPersonName(full: string): { firstName: string; lastName: string } {
    const parts = full.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
    return {
        firstName: parts.slice(0, -1).join(" "),
        lastName: parts[parts.length - 1]!,
    };
}

function mapOwnerDetail(
    own: Record<string, unknown>,
    flat?: Record<string, unknown>,
): OwnerDetail {
    const ownAddr = (own.address ?? {}) as Record<string, unknown>;
    const c = flat ?? {};
    return {
        firstName: str(c.ownerFirstName ?? own.firstName),
        middleName: str(own.middleName),
        lastName: str(c.ownerLastName ?? own.lastName),
        email: str(c.ownerEmail ?? own.email),
        mobileNumber: str(c.ownerMobileNumber ?? own.mobileNumber ?? c.ownerPhone),
        dateOfBirth: str(own.dateOfBirth),
        ssn: str(c.ownerSsn ?? own.ssn),
        ficoScore: (own.ficoScore as string | number) ?? "",
        ownershipStartDate: str(own.ownershipStartDate),
        ownershipPercentage: (own.ownershipPercentage as string | number) ?? "",
        address: {
            address1: str(ownAddr.address1),
            address2: str(ownAddr.address2),
            city: str(ownAddr.city),
            state: str(ownAddr.state),
            zipCode: str(ownAddr.zipCode),
        },
    };
}

function cloneOwnerDetail(owner: OwnerDetail): OwnerDetail {
    return { ...owner, address: { ...owner.address } };
}

function emptyOwnerDetail(): OwnerDetail {
    return {
        firstName: "",
        middleName: "",
        lastName: "",
        email: "",
        mobileNumber: "",
        dateOfBirth: "",
        ssn: "",
        ficoScore: "",
        ownershipStartDate: "",
        ownershipPercentage: "",
        address: {
            address1: "",
            address2: "",
            city: "",
            state: "",
            zipCode: "",
        },
    };
}

function resolveOwner1NameFromPrefill(prefill: Partial<BuildContractPrefillFieldsArgs>): string {
    return (
        str(prefill.guarantyClientName) ||
        str(prefill.guarantyOwner1Name) ||
        str(prefill.guarantyGuarantor1Name) ||
        str(prefill.owner1GuarantorName) ||
        str(prefill.achAuthorizationConcentAccountHolderName) ||
        str(prefill.authorizationClientNamePrint) ||
        str(prefill.customerName) ||
        str(prefill.clientName)
    );
}

function resolveOwner2NameFromPrefill(prefill: Partial<BuildContractPrefillFieldsArgs>): string {
    return (
        str(prefill.merchant2Name) ||
        str(prefill.guarantyOwner2Name) ||
        str(prefill.guarantyGuarantor2Name) ||
        str(prefill.owner2GuarantorName)
    );
}

function resolveOwner1SsFromPrefill(prefill: Partial<BuildContractPrefillFieldsArgs>): string {
    return (
        str(prefill.guarantySs) ||
        str(prefill.guarantyOwner1Ss) ||
        str(prefill.guarantyGuarantor1Ss)
    );
}

function resolveOwner2SsFromPrefill(prefill: Partial<BuildContractPrefillFieldsArgs>): string {
    return str(prefill.guarantyOwner2Ss) || str(prefill.guarantyGuarantor2Ss);
}

function existingClientPayload(anyApp: unknown): { business: ClientUpdatePayload["business"] & object; owner: OwnerDetail; owners: OwnerDetail[] } | null {
    const a = anyApp as Record<string, unknown> | null | undefined;
    const client = a?.client as Record<string, unknown> | undefined;
    if (!client) return null;
    const biz = (client.business ?? {}) as Record<string, unknown>;
    const addr = (biz.address ?? {}) as Record<string, unknown>;
    const own = (client.owner ?? {}) as Record<string, unknown>;

    const owner = mapOwnerDetail(own, client);
    const owners: OwnerDetail[] =
        Array.isArray(client.owners) && client.owners.length > 0
            ? client.owners.map((row, index) =>
                  mapOwnerDetail(row as Record<string, unknown>, index === 0 ? client : undefined),
              )
            : [owner];

    return {
        business: {
            name: str(client.businessName ?? biz.name),
            email: str(client.businessEmail ?? biz.email),
            number: str(client.businessNumber ?? client.businessPhone ?? biz.number),
            website: str(biz.website),
            incorporationDate: str(biz.incorporationDate),
            incorporationState: str(
                client.businessIncorporationState ?? biz.incorporationState ?? client.stateOfIncorporation,
            ),
            businessEntityType: str(client.businessEntityType ?? biz.businessEntityType),
            einNumber: str(client.businessEinNumber ?? client.federalTaxIdEin ?? client.ein ?? biz.einNumber),
            monthlyRevenue: (biz.monthlyRevenue as string | number) ?? "",
            address: {
                address1: str(client.businessAddress1 ?? addr.address1),
                address2: str(client.businessAddress2 ?? addr.address2),
                city: str(client.businessCity ?? addr.city),
                state: str(client.businessState ?? addr.state),
                zipCode: str(client.businessZipCode ?? addr.zipCode ?? client.businessZip),
            },
        },
        owner,
        owners,
    };
}

/**
 * Map contract prefill fields back onto the linked client record (business + owners).
 * Sends the full `owners[]` array so owner 1 and owner 2 SSN/name edits persist to CRM.
 */
export function buildClientUpdateFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs>,
    anyApp: unknown,
): ClientUpdatePayload | null {
    const base = existingClientPayload(anyApp);
    if (!base) return null;

    const business = { ...base.business, address: { ...base.business.address } };
    const owners =
        base.owners.length > 0
            ? base.owners.map(cloneOwnerDetail)
            : [cloneOwnerDetail(base.owner)];

    const o1Name = resolveOwner1NameFromPrefill(prefill);
    const o1Ssn = resolveOwner1SsFromPrefill(prefill);
    const o2Name = resolveOwner2NameFromPrefill(prefill);
    const o2Ssn = resolveOwner2SsFromPrefill(prefill);

    if (o1Name) {
        const { firstName, lastName } = splitPersonName(o1Name);
        if (firstName) owners[0]!.firstName = firstName;
        if (lastName) owners[0]!.lastName = lastName;
    }
    if (o1Ssn) owners[0]!.ssn = o1Ssn;

    if (o2Name || o2Ssn) {
        if (!owners[1]) owners.push(emptyOwnerDetail());
        if (o2Name) {
            const { firstName, lastName } = splitPersonName(o2Name);
            if (firstName) owners[1]!.firstName = firstName;
            // Always write lastName so a single-token signer clears a stale prior last name.
            owners[1]!.lastName = lastName;
        }
        if (o2Ssn) owners[1]!.ssn = o2Ssn;
    }

    if (str(prefill.legalName) || str(prefill.securityBusinessName) || str(prefill.authorizationClientName) || str(prefill.authorizationClientSignerName) || str(prefill.achAuthorizationAccountHolderName) || str(prefill.authorizationApplication)) {
        business.name =
            str(prefill.authorizationClientName) ||
            str(prefill.authorizationClientSignerName) ||
            str(prefill.achAuthorizationAccountHolderName) ||
            str(prefill.legalName) ||
            str(prefill.securityBusinessName) ||
            str(prefill.authorizationApplication);
    }
    if (str(prefill.federalTaxIdEin) || str(prefill.securityTaxEin) || str(prefill.authorizationClientTaxId)) {
        business.einNumber =
            str(prefill.federalTaxIdEin) ||
            str(prefill.securityTaxEin) ||
            str(prefill.authorizationClientTaxId);
    }
    if (str(prefill.state) || str(prefill.businessAddressState)) {
        business.incorporationState = str(prefill.state) || str(prefill.businessAddressState);
    }
    if (str(prefill.entityType)) business.businessEntityType = str(prefill.entityType);
    if (str(prefill.clientEmail)) {
        business.email = str(prefill.clientEmail);
        owners[0]!.email = str(prefill.clientEmail);
    }
    if (str(prefill.guarantorEmail)) {
        owners[0]!.email = str(prefill.guarantorEmail);
        if (!str(business.email)) business.email = str(prefill.guarantorEmail);
    }
    if (str(prefill.clientPhone)) {
        business.number = str(prefill.clientPhone);
        owners[0]!.mobileNumber = str(prefill.clientPhone);
    }
    if (str(prefill.guarantorPhone)) {
        owners[0]!.mobileNumber = str(prefill.guarantorPhone);
        if (!str(business.number)) business.number = str(prefill.guarantorPhone);
    }
    if (str(prefill.authorizedBusinessPhone) || str(prefill.achAuthorizationAccountHolderPhone)) {
        business.number =
            str(prefill.authorizedBusinessPhone) ||
            str(prefill.achAuthorizationAccountHolderPhone) ||
            str(business.number);
    }
    if (str(prefill.businessAddress) || str(prefill.securityBusinessAddress) || str(prefill.achAuthorizationAccountHolderAddress)) {
        business.address!.address1 =
            str(prefill.businessAddress) ||
            str(prefill.securityBusinessAddress) ||
            str(prefill.achAuthorizationAccountHolderAddress);
    }
    if (str(prefill.businessAddressCity) || str(prefill.securityBusinessAddressCity) || str(prefill.achAuthorizationAccountHolderCity)) {
        business.address!.city =
            str(prefill.businessAddressCity) ||
            str(prefill.securityBusinessAddressCity) ||
            str(prefill.achAuthorizationAccountHolderCity);
    }
    if (str(prefill.businessAddressState) || str(prefill.securityBusinessAddressState) || str(prefill.achAuthorizationAccountHolderState)) {
        business.address!.state =
            str(prefill.businessAddressState) ||
            str(prefill.securityBusinessAddressState) ||
            str(prefill.achAuthorizationAccountHolderState);
    }
    if (str(prefill.businessAddressZip) || str(prefill.securityBusinessAddressZip) || str(prefill.achAuthorizationAccountHolderZip)) {
        business.address!.zipCode =
            str(prefill.businessAddressZip) ||
            str(prefill.securityBusinessAddressZip) ||
            str(prefill.achAuthorizationAccountHolderZip);
    }

    /** Contact / mailing + guarantor address → Owner 1 home address. */
    const ownerStreet =
        str(prefill.businessAddressContract) || str(prefill.guarantorAddress);
    const ownerCity =
        str(prefill.businessAddressContractCity) || str(prefill.guarantorAddressCity);
    const ownerState =
        str(prefill.businessAddressContractState) || str(prefill.guarantorAddressState);
    const ownerZip =
        str(prefill.businessAddressContractZip) || str(prefill.guarantorAddressZip);
    if (ownerStreet || ownerCity || ownerState || ownerZip) {
        if (!owners[0]!.address) {
            owners[0]!.address = {
                address1: "",
                address2: "",
                city: "",
                state: "",
                zipCode: "",
            };
        }
        if (ownerStreet) owners[0]!.address.address1 = ownerStreet;
        if (ownerCity) owners[0]!.address.city = ownerCity;
        if (ownerState) owners[0]!.address.state = ownerState;
        if (ownerZip) owners[0]!.address.zipCode = ownerZip;
    }

    // Owner 2 email/phone when present on prefill aliases.
    if (owners[1]) {
        const o2Email =
            str((prefill as Record<string, unknown>).owner2Email) ||
            str((prefill as Record<string, unknown>).guarantor2Email);
        const o2Phone =
            str((prefill as Record<string, unknown>).owner2Phone) ||
            str((prefill as Record<string, unknown>).guarantor2Phone);
        if (o2Email) owners[1].email = o2Email;
        if (o2Phone) owners[1].mobileNumber = o2Phone;
    }

    const primaryOwner = cloneOwnerDetail(owners[0]!);

    return {
        business: business as ClientUpdatePayload["business"],
        owner: primaryOwner,
        owners,
    };
}

export function buildOfferDecisionUpsertFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs>,
    existingOfferDecision: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    const offer = parseMoney(prefill.purchaseAmount);
    const payback = parseMoney(prefill.purchasePrice);
    const repayPerPeriod = parseMoney(prefill.remittance);
    const frequency = sanitizePaymentFrequencyForPersist(prefill.frequency);
    const fees = parseMoney(prefill.appendixUnderwritingFees);

    if (
        offer == null &&
        payback == null &&
        repayPerPeriod == null &&
        !frequency &&
        fees == null
    ) {
        return null;
    }

    const existing = existingOfferDecision ?? {};
    const decision =
        str(existing.decision).toLowerCase() === "declined" ? "declined" : "approved";

    const payload: Record<string, unknown> = { decision };
    if (offer != null) payload.offer = offer;
    if (repayPerPeriod != null) payload.repayPerPeriod = repayPerPeriod;
    if (frequency) payload.frequency = frequency;
    if (fees != null) payload.fees = fees;

    if ("position" in existing && existing.position != null) payload.position = existing.position;
    // Factor rate (`OfferDecision.rate`) must stay independent of Specific Percentage /
    // SPA (`purchasePercent`). Never write SPA back onto application rate.
    if ("rate" in existing && existing.rate != null) {
        payload.rate = existing.rate;
    }
    if ("term" in existing && existing.term != null) payload.term = existing.term;
    if ("ourRemit" in existing && existing.ourRemit != null) payload.ourRemit = existing.ourRemit;
    // Preserve leverage % — do not overwrite with payback dollars from purchasePrice.
    if ("totalRemit" in existing && existing.totalRemit != null) {
        payload.totalRemit = existing.totalRemit;
    }

    const rate = parseMoney(existing.rate);
    const term = str(existing.term);
    if (offer != null && rate != null && rate >= 1 && term) {
        const stack = recalculateOfferFields(
            {
                advance: offer,
                factorRate: rate,
                payback: payback ?? 0,
                daily: repayPerPeriod ?? 0,
                term,
                frequency: frequency || str(existing.frequency) || "Daily",
            },
            "advance",
        );
        if (stack) {
            payload.repayPerPeriod = stack.daily;
            payload.monthlyPayment = stack.monthlyPayment;
        }
    } else if ("monthlyPayment" in existing && existing.monthlyPayment != null) {
        payload.monthlyPayment = existing.monthlyPayment;
    }

    return payload;
}

function resolveBankDetailId(
    bankDetail: Record<string, unknown> | null | undefined,
    contract?: Record<string, unknown> | null,
): string | null {
    const fromRow = bankDetail?._id ?? bankDetail?.id;
    if (fromRow != null && str(fromRow)) return String(fromRow);
    const paymentBank = contract?.paymentBank as Record<string, unknown> | null | undefined;
    const fromPayment = paymentBank?._id ?? paymentBank?.id;
    if (fromPayment != null && str(fromPayment)) return String(fromPayment);
    const fromContract = contract?.paymentBankId;
    if (fromContract != null && str(fromContract)) return String(fromContract);
    return null;
}

/**
 * Map contract prefill bank fields back onto the linked CRM BankDetail row.
 * Mirrors `bankDetailRowToPrefillPartial` in Contract.ts (BankDetail → prefill).
 */
export function buildBankDetailUpdateFromPrefill(
    prefill: Partial<BuildContractPrefillFieldsArgs>,
): UpdateBankDetailPayload | null {
    const bankName =
        str(prefill.authorizationClientBankName) ||
        str(prefill.achAuthorizationAccountHolderBankName);
    const accountNumber =
        str(prefill.authorizationClientBankAccount) ||
        str(prefill.achAuthorizationAccountHolderBankAccountNumber);
    const routingNumber =
        str(prefill.authorizationClientBankRouting) ||
        str(prefill.achAuthorizationAccountHolderBankRoutingNumber);

    if (!bankName && !accountNumber && !routingNumber) return null;

    const payload: UpdateBankDetailPayload = {};
    if (bankName) payload.bankName = bankName;
    if (accountNumber) payload.accountNumber = accountNumber;
    if (routingNumber) payload.routingNumber = routingNumber;
    return payload;
}

export type SyncContractPrefillSourceRecordsArgs = {
    dispatch: AppDispatch;
    applicationData: unknown;
    applicationUuid?: string | null;
    prefill: Partial<BuildContractPrefillFieldsArgs>;
    offerDecision?: Record<string, unknown> | null;
    contractGuarantors?: Record<string, unknown>[] | null;
    contractOwners?: Record<string, unknown>[] | null;
    contractAch?: Record<string, unknown> | null;
    bankDetail?: Record<string, unknown> | null;
    contract?: Record<string, unknown> | null;
};

async function syncContractPartyRowsFromPrefill(
    dispatch: AppDispatch,
    rows: Record<string, unknown>[] | null | undefined,
    prefill: Partial<BuildContractPrefillFieldsArgs>,
    kind: "guarantor" | "owner",
): Promise<void> {
    const list = Array.isArray(rows) ? rows : [];
    const patches: Array<{
        row: Record<string, unknown> | undefined;
        name: string;
        ssn: string;
        driverLicense: string;
        address?: string;
        city?: string;
        state?: string;
        zip?: string;
    }> = [
        {
            row: list[0],
            name: resolveOwner1NameFromPrefill(prefill),
            ssn: resolveOwner1SsFromPrefill(prefill),
            driverLicense:
                str(prefill.guarantySsDriverLicense) ||
                str(prefill.guarantyOwner1DriverLicense) ||
                str(prefill.guarantyGuarantor1DriverLicense),
            address: str(prefill.businessAddressContract) || str(prefill.guarantorAddress),
            city: str(prefill.businessAddressContractCity) || str(prefill.guarantorAddressCity),
            state: str(prefill.businessAddressContractState) || str(prefill.guarantorAddressState),
            zip: str(prefill.businessAddressContractZip) || str(prefill.guarantorAddressZip),
        },
        {
            row: list[1],
            name: resolveOwner2NameFromPrefill(prefill),
            ssn: resolveOwner2SsFromPrefill(prefill),
            driverLicense:
                str(prefill.guarantyOwner2DriverLicense) ||
                str(prefill.guarantyGuarantor2DriverLicense),
        },
    ];

    for (const patch of patches) {
        const id = patch.row?.id;
        if (id == null || String(id).trim() === "") continue;
        if (
            !patch.name &&
            !patch.ssn &&
            !patch.driverLicense &&
            !patch.address &&
            !patch.city &&
            !patch.state &&
            !patch.zip
        ) {
            continue;
        }

        const data: Record<string, unknown> = {};
        if (patch.ssn) data.ssn = patch.ssn;
        if (patch.driverLicense) data.driverLicense = patch.driverLicense;
        if (patch.address) data.address = patch.address;
        if (patch.city) data.city = patch.city;
        if (patch.state) data.state = patch.state;
        if (patch.zip) data.zip = patch.zip;
        if (patch.name) {
            const { firstName, lastName } = splitPersonName(patch.name);
            if (firstName) data.firstName = firstName;
            data.lastName = lastName;
        }
        if (kind === "guarantor") {
            await dispatch(
                updateContractGuarantor({
                    id: id as number | string,
                    data,
                }),
            ).unwrap();
        } else {
            await dispatch(
                updateContractOwner({
                    id: id as number | string,
                    data,
                }),
            ).unwrap();
        }
    }
}

async function syncContractAchFromPrefill(
    dispatch: AppDispatch,
    ach: Record<string, unknown> | null | undefined,
    prefill: Partial<BuildContractPrefillFieldsArgs>,
): Promise<void> {
    const id = ach?.id;
    if (id == null || String(id).trim() === "") return;

    const bankName =
        str(prefill.authorizationClientBankName) ||
        str(prefill.achAuthorizationAccountHolderBankName);
    const accountNumber =
        str(prefill.authorizationClientBankAccount) ||
        str(prefill.achAuthorizationAccountHolderBankAccountNumber);
    const routingNumber =
        str(prefill.authorizationClientBankRouting) ||
        str(prefill.achAuthorizationAccountHolderBankRoutingNumber);
    const dba =
        str(prefill.doingBusinessAs) ||
        str(prefill.achAuthorizationAccountHolderDba) ||
        str(prefill.securityDoingBusinessAs);
    const phone =
        str(prefill.authorizedBusinessPhone) ||
        str(prefill.achAuthorizationAccountHolderPhone) ||
        str(prefill.clientPhone);
    const paymentAmount =
        str(prefill.remittance) ||
        str(prefill.achAuthorizationAccountHolderBankTransactionFee);
    const frequency = sanitizePaymentFrequencyForPersist(prefill.frequency);
    const address =
        str(prefill.achAuthorizationAccountHolderAddress) || str(prefill.businessAddress);
    const city =
        str(prefill.achAuthorizationAccountHolderCity) || str(prefill.businessAddressCity);
    const state =
        str(prefill.achAuthorizationAccountHolderState) || str(prefill.businessAddressState);
    const zip =
        str(prefill.achAuthorizationAccountHolderZip) || str(prefill.businessAddressZip);

    const data: Record<string, unknown> = {};
    if (bankName) data.bankName = bankName;
    if (accountNumber) data.accountNumber = accountNumber;
    if (routingNumber) data.routingNumber = routingNumber;
    if (dba) data.dba = dba;
    if (phone) data.phone = phone;
    if (paymentAmount) data.paymentAmount = paymentAmount;
    if (frequency) data.frequency = frequency;
    if (address) data.address = address;
    if (city) data.city = city;
    if (state) data.state = state;
    if (zip) data.zip = zip;
    const holderName =
        str(prefill.achAuthorizationAccountHolderName) ||
        str(prefill.authorizationClientName) ||
        str(prefill.legalName);
    if (holderName) data.accountHolderName = holderName;
    if (str(prefill.achAuthorizationAccountHolderBankBranchCity)) {
        data.bankBranchCity = str(prefill.achAuthorizationAccountHolderBankBranchCity);
    }
    if (str(prefill.achAuthorizationAccountHolderBankState)) {
        data.bankState = str(prefill.achAuthorizationAccountHolderBankState);
    }
    if (str(prefill.achAuthorizationAccountHolderBankZip)) {
        data.bankZip = str(prefill.achAuthorizationAccountHolderBankZip);
    }
    if (Object.keys(data).length === 0) return;

    await dispatch(
        updateACH({
            id: id as number | string,
            data,
        }),
    ).unwrap();
}

/**
 * Persist offer-decision, client, bank, ACH, and owner/guarantor fields edited via
 * Verify contract prefill so application screens reload the same values.
 */
export async function syncContractPrefillToSourceRecords({
    dispatch,
    applicationData,
    applicationUuid = null,
    prefill,
    offerDecision = null,
    contractGuarantors = null,
    contractOwners = null,
    contractAch = null,
    bankDetail = null,
    contract = null,
}: SyncContractPrefillSourceRecordsArgs): Promise<void> {
    const offerAppId =
        resolveApplicationIdForOfferDecision(applicationData) ??
        (str(applicationUuid) || null);
    const appUuid =
        str(applicationUuid) || resolveApplicationUuidForUpdate(applicationData) || null;
    let clientId = resolveClientIdFromApplication(applicationData);
    if (!clientId) {
        const app = applicationData as Record<string, unknown> | null | undefined;
        const fromApp = app?.clientId;
        if (fromApp != null && str(fromApp)) clientId = String(fromApp);
    }
    const bankDetailId = resolveBankDetailId(bankDetail, contract);

    // Application detail sometimes omits nested client — fetch so business/owner updates still run.
    let appForClient = applicationData;
    if (clientId && !existingClientPayload(appForClient)) {
        try {
            const res = await dispatch(getClientById(clientId)).unwrap();
            const client = (res as { data?: unknown })?.data ?? res;
            if (client && typeof client === "object") {
                appForClient = { ...(appForClient as object), client };
            }
        } catch {
            /* continue with whatever we have */
        }
    }

    const tasks: Promise<unknown>[] = [];

    const offerPayload = buildOfferDecisionUpsertFromPrefill(prefill, offerDecision);
    if (offerPayload && offerAppId) {
        tasks.push(
            axiosPost("/offer-decisions", {
                applicationId: offerAppId,
                ...offerPayload,
            }).then(() => {
                emitOfferDecisionUpdated(offerAppId);
                return dispatch(getOfferDecisionByApplication(offerAppId)).unwrap();
            }),
        );
    }

    const clientPayload = buildClientUpdateFromPrefill(prefill, appForClient);
    if (clientPayload && clientId) {
        tasks.push(
            dispatch(
                updateClient({
                    id: clientId,
                    data: clientPayload,
                }),
            )
                .unwrap()
                .then(() => {
                    dispatch(resetUpdateClient());
                }),
        );
    }

    if (contractGuarantors?.length) {
        tasks.push(
            syncContractPartyRowsFromPrefill(dispatch, contractGuarantors, prefill, "guarantor"),
        );
    }
    if (contractOwners?.length) {
        tasks.push(syncContractPartyRowsFromPrefill(dispatch, contractOwners, prefill, "owner"));
    }
    if (contractAch) {
        tasks.push(syncContractAchFromPrefill(dispatch, contractAch, prefill));
    }

    const bankPayload = buildBankDetailUpdateFromPrefill(prefill);
    if (bankPayload && appUuid) {
        if (bankDetailId) {
            tasks.push(
                dispatch(
                    updateBankDetail({
                        id: bankDetailId,
                        data: bankPayload,
                    }),
                )
                    .unwrap()
                    .then(() => dispatch(getBankDetails({ application: appUuid })).unwrap()),
            );
        } else {
            // BankDetail create is handled server-side by syncContractPrefillToBankDetail
            // during updateContract; only refresh the list here to avoid duplicate rows.
            tasks.push(dispatch(getBankDetails({ application: appUuid })).unwrap());
        }
    }

    // Always refresh application last so Deal Review / app screens see all synced sources.
    if (appUuid) {
        tasks.push(dispatch(getApplicationById(appUuid)).unwrap());
    }

    if (tasks.length === 0) return;

    const results = await Promise.allSettled(tasks);
    const failures = results.filter((r) => r.status === "rejected");
    if (failures.length > 0) {
        console.warn("[ContractPrefillEditForm] source record sync partial failure:", failures);
        throw new Error(
            "Contract prefill saved, but some application or offer fields could not be synced. Refresh and try again.",
        );
    }
}
