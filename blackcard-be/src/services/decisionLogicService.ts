import { sendDecisionLogicEmail } from "./emailService";
import { clientService } from "./clientService";
import { tokenManager } from "./business/tokenManager";
import { NotFoundError, ValidationError } from "../utils/errors";

import { tokenRepository } from "./repositories/tokenRepository";
import { decisionLogicRepository } from "./repositories/decisionLogicRepository";
import { createAndVerifyRequestSoap2 } from "./decisionLogicSoapClient";
import {
    DECISION_LOGIC_REPORT_NOT_COMPLETE_MESSAGE,
    isDecisionLogicReportsDetailsComplete,
} from "../utils/decisionLogicReportStatus";

function decisionLogicDebugEnabled(): boolean {
    return String(process.env.DECISION_LOGIC_DEBUG ?? "").trim() === "true";
}

/** Safe breadcrumb (no PII). Always on so you can tell /generate-report ran. */
function decisionLogicBreadcrumb(
    step: string,
    meta: Record<string, string | number | boolean | undefined>,
): void {
    // eslint-disable-next-line no-console
    console.info(`[DecisionLogic] ${step}`, meta);
}

/** Base for REST v1 calls (no trailing slash). Defaults to DL integration; override if DL gives you a prod-compatible URL. */
function decisionLogicRestV1Base(): string {
    const raw =
        process.env.DECISION_LOGIC_REST_V1_BASE ??
        "https://integration.decisionlogic.com/restful/v1";
    return raw.replace(/\/$/, "");
}

type CreateVerifyTransport = "soap_first" | "rest_first" | "soap" | "rest";

function createVerifyTransportMode(): CreateVerifyTransport {
    const raw = String(
        process.env.DECISION_LOGIC_CREATE_TRANSPORT ?? "soap",
    )
        .trim()
        .toLowerCase();
    if (
        raw === "rest" ||
        raw === "soap" ||
        raw === "rest_first" ||
        raw === "soap_first"
    ) {
        return raw;
    }
    return "soap";
}

function decisionLogicContentServiceId(): number {
    const raw = String(process.env.DECISION_LOGIC_CONTENT_SERVICE_ID ?? "0").trim();
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

export const decisionLogicService = {
    async generateDecisionLogicLink(
        businessOwnerId: number,
        bankAccountId: number
    ) {
        try {
            const token = await tokenManager.generateDecisionLogicToken(
                businessOwnerId,
                bankAccountId
            );

            await tokenRepository.saveDecisionLogicToken(
                businessOwnerId,
                bankAccountId,
                token
            );
            const businessOwner =
                await clientService.fetchBusinessOwner(businessOwnerId);

            await sendDecisionLogicEmail(businessOwner.email, token);



        } catch (error) {
            throw error;
        }
    },

    async validateDecisionLogicToken(token: string) {
        try {
            const decisionLogicToken =
                await tokenRepository.findDecisionLogicToken(token);

            if (!decisionLogicToken || decisionLogicToken.expiresAt < new Date()) {
                const errorMessage = !decisionLogicToken
                    ? "The provided token is invalid. Please request a valid token."
                    : "The provided token has expired. Please request a new token.";
                throw new NotFoundError(errorMessage);
            }

            const decodedToken = await tokenManager.validateDecisionLogicToken(token);

            const { businessOwnerId, bankAccountId } = decodedToken;

            if (!businessOwnerId || !bankAccountId) {
                throw new Error("Token is missing required information.");
            }

            return { businessOwnerId, bankAccountId };
        } catch (error) {
            throw error;
        }
    },

    async createAndVerifyRequest(
        businessOwnerId: number,
        bankAccountId: number,
        applicationId?: string | null,
        invitationToken?: string | null,
    ) {
        try {
            const tokenRef = String(invitationToken ?? "").trim();
            if (tokenRef) {
                const existingToken =
                    await tokenRepository.findDecisionLogicToken(tokenRef);
                if (existingToken?.requestCode) {
                    const cached = String(existingToken.requestCode).trim();
                    if (cached) {
                        decisionLogicBreadcrumb(
                            "createAndVerifyRequest: reusing request code from invitation token",
                            {
                                requestCodePrefix: cached.slice(0, 4),
                                requestCodeLength: cached.length,
                                businessOwnerId,
                                bankAccountId,
                            },
                        );
                        return { requestCode: cached };
                    }
                }
            }

            const applicationRef = String(applicationId ?? "").trim() || null;
            const businessOwner =
                await clientService.fetchBusinessOwner(businessOwnerId, applicationRef);

            const bankAccount = await clientService.fetchBankAccount(
                bankAccountId,
                businessOwnerId,
                applicationRef,
            );

            const serviceKey = String(process.env.SERVICE_KEY ?? "").trim();
            const siteUserGuid = String(process.env.SITE_USER_GUID ?? "").trim();
            const profileGuid = String(process.env.PROFILE_GUID ?? "").trim();
            if (!serviceKey || !siteUserGuid || !profileGuid) {
                throw new ValidationError(
                    "Decision Logic is not configured: set SERVICE_KEY, SITE_USER_GUID, and PROFILE_GUID on the server.",
                );
            }

            const payload = {
                serviceKey,
                siteUserGuid,
                profileGuid,
                customerId: String(businessOwnerId),
                firstName: businessOwner.firstName || "",
                lastName: businessOwner.lastName || "",
                accountNumber:
                    bankAccount.accountNumber?.replace(/\D/g, "") || "",
                routingNumber:
                    bankAccount.routingNumber?.replace(/\D/g, "") || "",
                institutionId: decisionLogicContentServiceId(),
                emailAddress: businessOwner.email || "",
                matchType: 0,
                matchConsumerReferenceId: String(businessOwnerId),
                matchFirstName: businessOwner.firstName || "",
                matchMiddleName: businessOwner.middleName || "",
                matchLastName: businessOwner.lastName || "",
                matchSuffix: businessOwner.nameSuffix || "",
                matchAddressStreet: businessOwner.address1 || "",
                matchAddressCity: businessOwner.city || "",
                matchAddressState: businessOwner.state || "",
                matchAddressZip: businessOwner.zip || "",
                matchPhoneNumber: businessOwner.mobile || "",
                matchSocialSecurityNumber: businessOwner.ssn || "",
                matchEmailAddress: businessOwner.email || "",
                matchDobDay: businessOwner.dob.getDate() || 0,
                matchDobMonth: businessOwner.dob.getMonth() + 1 || 0,
                matchDobYear: businessOwner.dob.getFullYear() || 0,
                matchDriversLicenseState: businessOwner.driverLicenseState || "",
                matchDriversLicenseNumber: businessOwner.driverLicenseID || "",
            };

            const soapPayload = {
                serviceKey,
                siteUserGuid,
                profileGuid,
                customerId: payload.customerId,
                firstName: payload.firstName,
                lastName: payload.lastName,
                accountNumber: payload.accountNumber,
                routingNumber: payload.routingNumber,
                contentServiceId: payload.institutionId ?? 0,
                emailAddress: payload.emailAddress,
                matchType: payload.matchType,
                matchConsumerReferenceId: payload.matchConsumerReferenceId,
                matchFirstName: payload.matchFirstName,
                matchMiddleName: payload.matchMiddleName,
                matchLastName: payload.matchLastName,
                matchSuffix: payload.matchSuffix,
                matchAddressStreet: payload.matchAddressStreet,
                matchAddressCity: payload.matchAddressCity,
                matchAddressState: payload.matchAddressState,
                matchAddressZip: payload.matchAddressZip,
                matchPhoneNumber: payload.matchPhoneNumber,
                matchSocialSecurityNumber: payload.matchSocialSecurityNumber,
                matchEmailAddress: payload.matchEmailAddress,
                matchDobDay: payload.matchDobDay,
                matchDobMonth: payload.matchDobMonth,
                matchDobYear: payload.matchDobYear,
                matchDriversLicenseState: payload.matchDriversLicenseState,
                matchDriversLicenseNumber: payload.matchDriversLicenseNumber,
            };

            const requestViaRest = async (): Promise<string> => {
                const requestCodeUrl = `${decisionLogicRestV1Base()}/CreateAndVerifyRequest`;
                const response = await fetch(requestCodeUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    let detail = "An unknown error occurred";
                    try {
                        const errorBody = (await response.json()) as {
                            errorMessage?: string;
                            message?: string;
                        };
                        detail =
                            errorBody?.errorMessage ??
                            errorBody?.message ??
                            detail;
                    } catch {
                        /* non-JSON error body */
                    }
                    throw new Error(detail);
                }

                const data = await response.json();
                const requestCode =
                    String((data as { requestCode?: unknown })?.requestCode ?? "").trim() ||
                    String(
                        (data as { data?: { requestCode?: unknown } })?.data
                            ?.requestCode ?? "",
                    ).trim();

                console.log("requestCode", requestCode);

                if (!requestCode) {
                    throw new Error("RequestCode not received from DecisionLogic");
                }
                return requestCode;
            };

            const requestViaSoap = async (): Promise<string> => {
                const soapResult = await createAndVerifyRequestSoap2(soapPayload);
                console.log("soapResult", soapResult);
                console.log("soapPayload", soapPayload);
                if (decisionLogicDebugEnabled()) {
                    decisionLogicBreadcrumb("createAndVerifyRequest SOAP result", {
                        isError: soapResult.isError,
                        hasRequestCode:
                            Boolean(String(soapResult.requestCode ?? "").trim()),
                        errorLen: soapResult.errorMessage?.length ?? 0,
                    });
                }
                // console.log("soapResult.requestCode", soapResult.requestCode);
                console.log("soapResult.isError", soapResult.isError);
                if (
                    soapResult.isError ||
                    !String(soapResult.requestCode ?? "").trim()
                ) {
                    throw new Error(
                        soapResult.errorMessage ||
                        "Decision Logic SOAP CreateAndVerifyRequest2 failed.",
                    );
                }
                return String(soapResult.requestCode).trim();
            };

            const mode = createVerifyTransportMode();
            console.log("mode", mode);
            let requestCode = "";

            if (mode === "rest") {
                requestCode = await requestViaRest();
            } else if (mode === "soap") {
                requestCode = await requestViaSoap();
                console.log("requestCode from requestViaSoap", requestCode);
            } else if (mode === "soap_first") {
                try {
                    requestCode = await requestViaSoap();
                } catch {
                    requestCode = await requestViaRest();
                }
            } else {
                try {
                    requestCode = await requestViaRest();
                } catch {
                    requestCode = await requestViaSoap();
                }
            }

            if (decisionLogicDebugEnabled()) {
                decisionLogicBreadcrumb("createAndVerifyRequest done", {
                    mode,
                    requestCodePrefix: requestCode.slice(0, 4),
                    requestCodeLength: requestCode.length,
                });
            }

            console.log("requestCode", requestCode);

            if (tokenRef) {
                await tokenRepository.saveDecisionLogicTokenRequestCode(
                    tokenRef,
                    requestCode,
                );
            }

            return { requestCode };
        } catch (error) {
            throw error;
        }
    },

    async fetchDecisionLogicReportAndSave(
        requestCode: string,
        businessOwnerId: number,
        bankAccountId: number
    ) {
        try {
            const rc = String(requestCode ?? "").trim();
            const bo = Number(businessOwnerId);
            const ba = Number(bankAccountId);
            if (!rc || !Number.isFinite(bo) || bo <= 0 || !Number.isFinite(ba) || ba <= 0) {
                throw new ValidationError(
                    "Missing or invalid fields: requestCode, businessOwnerId, or bankAccountId."
                );
            }

            decisionLogicBreadcrumb(
                "fetchDecisionLogicReportAndSave: invoked (frontend called POST /generate-report)",
                {
                    requestCodePrefix: rc.slice(0, 4),
                    requestCodeLength: rc.length,
                    businessOwnerId: bo,
                    bankAccountId: ba,
                },
            );

            const serviceKey = String(process.env.SERVICE_KEY ?? "").trim();

            if (!serviceKey) {
                throw new ValidationError(
                    "Service key is missing in environment variables."
                );
            }

            const existingReport = await decisionLogicRepository.findExistingReport(
                rc,
                bo,
                ba
            );

            if (
                existingReport &&
                isDecisionLogicReportsDetailsComplete(existingReport.reportsDetails)
            ) {
                decisionLogicBreadcrumb(
                    "fetchDecisionLogicReportAndSave: complete cached row, skipping DL GetReportDetails",
                    {
                        requestCodePrefix: rc.slice(0, 4),
                        requestCodeLength: rc.length,
                        businessOwnerId: bo,
                        bankAccountId: ba,
                    },
                );
                return existingReport;
            }

            if (existingReport) {
                decisionLogicBreadcrumb(
                    "fetchDecisionLogicReportAndSave: incomplete cached row, refetching DL GetReportDetails",
                    {
                        requestCodePrefix: rc.slice(0, 4),
                        requestCodeLength: rc.length,
                        businessOwnerId: bo,
                        bankAccountId: ba,
                    },
                );
            }

            const url = `${decisionLogicRestV1Base()}/GetReportDetailsFromRequestCode`;
            let reportHost = "";
            try {
                reportHost = new URL(url).host;
            } catch {
                reportHost = "";
            }
            decisionLogicBreadcrumb(
                "fetchDecisionLogicReportAndSave: calling GetReportDetailsFromRequestCode REST",
                { urlHost: reportHost },
            );

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    accept: "*/*",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ serviceKey, requestCode: rc }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Failed to fetch from external API: ${errorText}`);
            }

            const responseData = (await response.json()) as {
                data?: { reportsDetails?: unknown };
            };
            if (decisionLogicDebugEnabled()) {
                decisionLogicBreadcrumb(
                    "fetchDecisionLogicReportAndSave: DL JSON received",
                    { hasReportsDetails: Boolean(responseData?.data?.reportsDetails) },
                );
            }

            const reportsDetails = responseData?.data?.reportsDetails;
            if (reportsDetails === undefined || reportsDetails === null) {
                throw new Error("Invalid response structure from external API.");
            }

            if (!isDecisionLogicReportsDetailsComplete(reportsDetails)) {
                throw new ValidationError(DECISION_LOGIC_REPORT_NOT_COMPLETE_MESSAGE);
            }

            const saved = await decisionLogicRepository.saveDecisionLogicReport(
                reportsDetails,
                bo,
                ba
            );

            decisionLogicBreadcrumb(
                "fetchDecisionLogicReportAndSave: report persisted",
                {
                    requestCodePrefix: rc.slice(0, 4),
                    requestCodeLength: rc.length,
                    businessOwnerId: bo,
                    bankAccountId: ba,
                },
            );

            return saved;
        } catch (error) {
            throw error;
        }
    },

    async fetchDecisionLogicReport(businessOwnerId: number) {
        try {
            if (!businessOwnerId) {
                throw new ValidationError(
                    "Business Owner ID is required and cannot be missing."
                );
            }
            console.log("businessOwnerId from fetchDecisionLogicReport", businessOwnerId);

            const businessOwner =
                await clientService.fetchBusinessOwner(businessOwnerId);

            console.log("businessOwner from fetchDecisionLogicReport", businessOwner);

            if (!businessOwner.bankAccounts.length) {
                throw new NotFoundError(
                    "No bank accounts found for the business owner."
                );
            }
            console.log("businessOwner.bankAccounts.length from fetchDecisionLogicReport", businessOwner.bankAccounts.length);

            return await decisionLogicRepository.findDecisionLogicReport(
                businessOwnerId
            );
        } catch (error) {
            throw error;
        }
    },
};


// Generate Link → Email → User Click the link → Token Verify → API Call → Report Save → Fetch Report
