import {
    buildAchFormEnvelopeEmailSubject,
    buildContractEnvelopeEmailSubject,
    CONTRACT_ENVELOPE_LENDER_NAME,
} from "./docusignTemplateConfig";

/** Which documents are included in a single DocuSign envelope from Create Contract. */
export type ContractSendPackageSelection = {
    includeMainContract: boolean;
    includeAddendum: boolean;
    includeDisclosure: boolean;
};

export function contractSendPackageFingerprint(
    selection: ContractSendPackageSelection,
): string {
    const parts: string[] = [];
    if (selection.includeMainContract) parts.push("contract");
    if (selection.includeAddendum) parts.push("addendum");
    if (selection.includeDisclosure) parts.push("disclosure");
    return parts.join("+") || "none";
}

export function resolveEffectiveSendPackage(input: {
    includeMainContractInSend: boolean;
    addendumLayoutKey: string | null;
    disclosureRef: string | null;
}): ContractSendPackageSelection {
    const hasAddendum = Boolean(input.addendumLayoutKey);
    const hasDisclosure = Boolean(input.disclosureRef);
    const canSendWithoutContract = hasAddendum || hasDisclosure;

    if (!canSendWithoutContract || input.includeMainContractInSend) {
        return {
            includeMainContract: true,
            includeAddendum: hasAddendum,
            includeDisclosure: hasDisclosure,
        };
    }

    return {
        includeMainContract: false,
        includeAddendum: hasAddendum,
        includeDisclosure: hasDisclosure,
    };
}

export function canSendWithoutMainContract(
    addendumLayoutKey: string | null,
    disclosureRef: string | null,
): boolean {
    return Boolean(addendumLayoutKey || disclosureRef);
}

export function validateContractSendPackage(
    selection: ContractSendPackageSelection,
    context: {
        addendumLayoutKey: string | null;
        disclosureRef: string | null;
    },
): string | null {
    if (
        !selection.includeMainContract &&
        !selection.includeAddendum &&
        !selection.includeDisclosure
    ) {
        return "At least one document must be included in this send.";
    }
    if (selection.includeAddendum && !context.addendumLayoutKey) {
        return "Select an addendum below to include it in this send.";
    }
    if (selection.includeDisclosure && !context.disclosureRef) {
        return "Link a state disclosure below to include it in this send.";
    }
    return null;
}

export function buildPackageEnvelopeEmailSubject(
    businessName: string,
    selection: ContractSendPackageSelection,
    offerAmount?: number | string | null,
    funderName?: string | null,
): string {
    const business = String(businessName || "").trim() || "Business";
    const lender =
        String(funderName || "").trim() || CONTRACT_ENVELOPE_LENDER_NAME;
    if (selection.includeMainContract) {
        return buildContractEnvelopeEmailSubject(business, offerAmount, lender);
    }
    // Addendum / disclosure-only: same Funder: Business $Amount pattern.
    return buildContractEnvelopeEmailSubject(business, offerAmount, lender);
}

export function buildPackageEnvelopeEmailMessage(
    businessName: string,
    selection: ContractSendPackageSelection,
    funderName?: string | null,
): string {
    const business = String(businessName || "").trim() || "your business";
    const lender =
        String(funderName || "").trim() || CONTRACT_ENVELOPE_LENDER_NAME;
    if (selection.includeMainContract) {
        return `Please review and sign your agreement with ${lender}.`;
    }
    if (selection.includeAddendum && selection.includeDisclosure) {
        return `Please review and sign the addendum and state disclosure for ${business}.`;
    }
    if (selection.includeAddendum) {
        return `Please review and sign the addendum for ${business}.`;
    }
    if (selection.includeDisclosure) {
        return `Please review and sign the state disclosure for ${business}.`;
    }
    return `Please review and sign the documents for ${business}.`;
}

/** ACH standalone uses a dedicated subject — not part of the 3-document package. */
export { buildAchFormEnvelopeEmailSubject };
