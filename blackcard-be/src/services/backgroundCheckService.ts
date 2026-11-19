import prisma from '../config/prismaClient';
import { runCheck } from './backgroundCheckRunners';
import type {
    ClearBusinessSearchSubject,
    ClearPersonSearchSubject,
} from './backgroundCheckRunners';
import { fetchClearReportPdfsForSearch, selectClearReportGroupIds } from './backgroundCheckRunners/clearS2sReports';
import {
    inventoryClearLienJudgmentTags,
    parseClearLienJudgmentRecords,
    type ClearLienJudgmentRecord,
} from './backgroundCheckRunners/clearS2sLienJudgment';
import {
    mergeClearNamesIntoExhibitPrefill,
    parseClearCorporateAssociations,
    uniqueClearCorporateNames,
    type ClearCorporateAssociationRecord,
} from './backgroundCheckRunners/clearS2sCorporateAssociations';
import { resolveClientOwners } from '../utils/clientMapper';
import { createApplicationActivityLog } from './applicationActivityLogService';
import {
    CompanyResearchError,
    isGeminiBriefConfigured,
    writeGeminiCompanyBrief,
} from './backgroundCheckRunners/geminiCompanyBrief';
import uploadService from './uploadService';

/**
 * Background Check module — due-diligence checks on a deal (Application) that
 * gate contract sending. Manual entry this pass. All status/result/decision
 * changes are audited in BackgroundCheckEvent (append-only).
 *
 * Loosely-typed prisma handle to avoid generated-enum-type lag in local dev.
 */
const db = prisma as any;

export const CHECK_TYPES = ['TLO', 'OPENCORPORATES', 'SOS', 'NY_COURT', 'DATAMERCH', 'GOOGLE'] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

/** Roles allowed to record a decision. */
export const DECIDER_ROLES = ['UNDERWRITER', 'FINAL_UNDERWRITER', 'ADMIN', 'SUPER_ADMIN'];
/** Roles allowed to override a FAIL and to reopen/configure. */
export const OVERRIDE_ROLES = ['ADMIN', 'SUPER_ADMIN'];

const RESULTS = ['PASS', 'FAIL', 'FLAG', 'NA'];
const ITEM_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'];

export class BackgroundCheckError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

type Actor = { id?: string; role?: string } | undefined;
const norm = (r?: string) => String(r || '').trim().toUpperCase().replace(/-/g, '_');

const fullInclude = {
    items: { include: { attachments: true }, orderBy: { checkType: 'asc' as const } },
    decision: true,
    events: { orderBy: { createdAt: 'desc' as const }, take: 100 },
};

async function logEvent(
    backgroundCheckId: string,
    action: string,
    opts: { itemId?: string; fromStatus?: string; toStatus?: string; detail?: any; actorId?: string } = {},
) {
    await db.backgroundCheckEvent.create({
        data: {
            backgroundCheckId,
            itemId: opts.itemId ?? null,
            action,
            fromStatus: opts.fromStatus ?? null,
            toStatus: opts.toStatus ?? null,
            detail: opts.detail ?? undefined,
            actorId: opts.actorId ?? null,
        },
    });
}

async function getByApplication(applicationId: string) {
    return db.backgroundCheck.findUnique({ where: { applicationId }, include: fullInclude });
}

/** Get the check for a deal, lazily creating it + the 6 items the first time. */
async function getOrCreateForApplication(applicationId: string, actor: Actor) {
    const existing = await getByApplication(applicationId);
    if (existing) return existing;

    const app = await db.application.findUnique({ where: { id: applicationId }, select: { id: true } });
    if (!app) throw new BackgroundCheckError('Application not found', 404);

    const created = await db.backgroundCheck.create({
        data: {
            applicationId,
            createdById: actor?.id ?? null,
            items: { create: CHECK_TYPES.map((checkType) => ({ checkType, required: true })) },
        },
    });
    await logEvent(created.id, 'created', { actorId: actor?.id });
    return getByApplication(applicationId);
}

/** READY_FOR_DECISION once all required items are COMPLETE; locked once decided. */
async function recomputeStatus(backgroundCheckId: string, actorId?: string) {
    const check = await db.backgroundCheck.findUnique({
        where: { id: backgroundCheckId },
        include: { items: true, decision: true },
    });
    if (!check) return;
    if (check.decision) return; // APPROVED/DECLINED is terminal until reopened

    const items = check.items as any[];
    const requiredItems = items.filter((i) => i.required);
    const allRequiredComplete = requiredItems.length > 0 && requiredItems.every((i) => i.status === 'COMPLETE');
    const anyStarted = items.some((i) => i.status !== 'NOT_STARTED' || i.result);

    const next = allRequiredComplete ? 'READY_FOR_DECISION' : anyStarted ? 'IN_PROGRESS' : 'NOT_STARTED';
    if (next !== check.status) {
        await db.backgroundCheck.update({ where: { id: backgroundCheckId }, data: { status: next } });
        await logEvent(backgroundCheckId, 'status_recomputed', { fromStatus: check.status, toStatus: next, actorId });
    }
}

async function updateItem(
    itemId: string,
    body: { result?: string | null; notes?: string; status?: string; required?: boolean; metadata?: Record<string, unknown> | null },
    actor: Actor,
) {
    const item = await db.backgroundCheckItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BackgroundCheckError('Check item not found', 404);

    const data: any = {};
    if (body.result !== undefined) {
        if (body.result === null || body.result === '') data.result = null;
        else {
            const r = String(body.result).trim().toUpperCase();
            if (!RESULTS.includes(r)) throw new BackgroundCheckError(`Invalid result. Allowed: ${RESULTS.join(', ')}`);
            data.result = r;
        }
    }
    if (body.notes !== undefined) data.notes = String(body.notes);
    if (body.required !== undefined) data.required = Boolean(body.required);
    if (body.metadata !== undefined) {
        data.metadata = body.metadata === null
            ? null
            : {
                ...(item.metadata && typeof item.metadata === 'object' ? item.metadata : {}),
                ...body.metadata,
            };
    }
    if (body.status !== undefined) {
        const s = String(body.status).trim().toUpperCase();
        if (!ITEM_STATUSES.includes(s)) throw new BackgroundCheckError(`Invalid status. Allowed: ${ITEM_STATUSES.join(', ')}`);
        data.status = s;
    }

    // Rule: a check cannot be marked COMPLETE without a result.
    const effectiveResult = data.result !== undefined ? data.result : item.result;
    const effectiveStatus = data.status ?? item.status;
    if (effectiveStatus === 'COMPLETE' && !effectiveResult) {
        throw new BackgroundCheckError('A check cannot be completed without a result.');
    }

    // Stamp performer/time whenever a result is recorded.
    if (data.result) {
        data.performedById = actor?.id ?? null;
        data.performedAt = new Date();
    }

    const updated = await db.backgroundCheckItem.update({ where: { id: itemId }, data });
    await logEvent(item.backgroundCheckId, 'item_updated', {
        itemId,
        fromStatus: item.status,
        toStatus: updated.status,
        detail: { checkType: item.checkType, result: updated.result },
        actorId: actor?.id,
    });
    await recomputeStatus(item.backgroundCheckId, actor?.id);
    return getCheck(item.backgroundCheckId);
}

/**
 * Company Research, the panel at the top of the Background Check tab.
 *
 * Like mca-tool, the panel's business name, address and EIN are the deal's
 * shared identity: they are prefilled from the application, and any value the
 * underwriter corrects is saved back to the application's business profile, so
 * DataMerch, OpenCorporates, Google, CLEAR and the rest read the same values.
 * A blank field never erases a stored value. The owner name is only used for
 * the search; owners are edited on the application.
 *
 * Gemini then researches the business and the brief is saved on the Google
 * check (metadata.companyBrief), so reopening the deal shows it without paying
 * for the search again. A new run replaces it. The brief never sets the check's
 * result or notes; that stays the underwriter's call.
 */
const RESEARCH_FIELDS: { key: string; clientKey: string; max: number }[] = [
    { key: 'businessName', clientKey: 'businessName', max: 200 },
    { key: 'address1', clientKey: 'businessAddress1', max: 200 },
    { key: 'city', clientKey: 'businessCity', max: 100 },
    { key: 'state', clientKey: 'businessState', max: 50 },
    { key: 'zipCode', clientKey: 'businessZipCode', max: 20 },
    { key: 'ein', clientKey: 'businessEinNumber', max: 40 },
];
const cleanField = (v: unknown, max: number) =>
    String(v ?? '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);

async function runCompanyResearch(
    applicationId: string,
    body: Record<string, unknown>,
    actor: Actor,
    req?: any,
) {
    const check = await getOrCreateForApplication(applicationId, actor);
    if (check?.decision) {
        throw new BackgroundCheckError('Reopen the background check before running company research.', 409);
    }
    const item = (check?.items || []).find((i: any) => i.checkType === 'GOOGLE');
    if (!item) throw new BackgroundCheckError('Google background-check item was not found.', 404);

    const application = await db.application.findUnique({
        where: { id: applicationId },
        include: { client: { include: { owners: true } } },
    });
    const client = application?.client;
    if (!client) {
        throw new BackgroundCheckError('This application has no business profile to research.');
    }

    // Save what the underwriter corrected; never blank a stored value.
    const updateData: Record<string, string> = {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const values: Record<string, string> = {};
    for (const f of RESEARCH_FIELDS) {
        const stored = String(client[f.clientKey] ?? '').trim();
        const typed = cleanField(body[f.key], f.max);
        values[f.key] = typed || stored;
        if (typed && typed !== stored) {
            updateData[f.clientKey] = typed;
            before[f.key] = stored;
            after[f.key] = typed;
        }
    }

    const missing = [
        !values.businessName && 'Business name',
        !values.address1 && !values.city && 'Address',
    ].filter(Boolean);
    if (missing.length) {
        throw new BackgroundCheckError(`Needed to research a business: ${missing.join(', ')}.`);
    }
    if (!isGeminiBriefConfigured()) {
        throw new BackgroundCheckError('Company research is not configured. Add GEMINI_API_KEY.', 503);
    }

    if (Object.keys(updateData).length) {
        await db.client.update({ where: { id: client.id }, data: updateData });
        await createApplicationActivityLog({
            applicationId,
            user: actor as any,
            actionType: 'APPLICATION_UPDATED',
            actionDescription: 'Updated business details from Company Research',
            req,
            metadata: { source: 'company_research', fields: Object.keys(after), before, after },
        } as any).catch((e: any) => console.error('[companyResearch] activity log failed:', e?.message || e));
        await logEvent(item.backgroundCheckId, 'business_details_updated', {
            itemId: item.id,
            detail: { source: 'company_research', before, after },
            actorId: actor?.id,
        });
    }

    const owner = resolveClientOwners(client)[0];
    const typedOwner = cleanField(body.ownerName, 200);
    const identity = {
        businessName: values.businessName,
        address: [
            [values.address1, client.businessAddress2].filter(Boolean).join(' '),
            values.city,
            [values.state, values.zipCode].filter(Boolean).join(' '),
        ]
            .map((part) => String(part || '').trim())
            .filter(Boolean)
            .join(', '),
        ein: values.ein,
        website: String(client.businessWebsite || '').trim(),
        ownerName: typedOwner || [owner?.firstName, owner?.lastName].filter(Boolean).join(' ').trim(),
    };

    await logEvent(item.backgroundCheckId, 'automated_check_started', {
        itemId: item.id,
        detail: { checkType: item.checkType, provider: 'Gemini company research' },
        actorId: actor?.id,
    });

    try {
        const result = await writeGeminiCompanyBrief(identity);
        const researcher = actor?.id
            ? await db.user
                  .findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true } })
                  .catch(() => null)
            : null;
        await updateItem(item.id, {
            metadata: {
                companyBrief: {
                    ...result.brief,
                    sources: result.sources,
                    searchQueries: result.searchQueries,
                    researched: identity,
                    researchedAt: new Date().toISOString(),
                    researchedBy: [researcher?.firstName, researcher?.lastName].filter(Boolean).join(' '),
                    provider: 'gemini',
                    model: result.model,
                },
            },
        }, actor);
        await logEvent(item.backgroundCheckId, 'automated_check_completed', {
            itemId: item.id,
            detail: {
                checkType: item.checkType,
                provider: 'Gemini company research',
                identityConfidence: result.brief.identityConfidence,
                negativeFindings: result.brief.negativeFindings.length,
            },
            actorId: actor?.id,
        });
        return {
            check: await getCheck(item.backgroundCheckId),
            updatedFields: Object.keys(after),
        };
    } catch (error: any) {
        await logEvent(item.backgroundCheckId, 'automated_check_failed', {
            itemId: item.id,
            detail: {
                checkType: item.checkType,
                provider: 'Gemini company research',
                message: String(error?.message || 'Company research failed').slice(0, 500),
            },
            actorId: actor?.id,
        });
        throw new BackgroundCheckError(
            error?.message || 'Company research failed.',
            error instanceof CompanyResearchError ? error.statusCode : 502,
        );
    }
}

async function runAutomatedItem(itemId: string, actor: Actor) {
    const item = await db.backgroundCheckItem.findUnique({
        where: { id: itemId },
        include: {
            backgroundCheck: {
                include: {
                    decision: true,
                    application: {
                        include: {
                            client: {
                                include: {
                                    owners: true,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
    if (!item) throw new BackgroundCheckError('Check item not found', 404);
    if (item.checkType !== 'TLO') {
        throw new BackgroundCheckError('This background check does not support automated execution.');
    }
    if (item.backgroundCheck?.decision) {
        throw new BackgroundCheckError('Reopen the background check before running CLEAR.', 409);
    }

    const application = item.backgroundCheck?.application;
    const client = application?.client;
    if (!application || !client) {
        throw new BackgroundCheckError('Application owner data is unavailable for CLEAR Person Search.');
    }

    const owners = resolveClientOwners(client);
    if (!owners.length) {
        throw new BackgroundCheckError('No application owners are available for CLEAR Person Search.');
    }
    const subjects: ClearPersonSearchSubject[] = owners.map((owner: any, index: number) => ({
        firstName: owner.firstName,
        middleName: owner.middleName,
        lastName: owner.lastName,
        dateOfBirth: owner.dateOfBirth,
        ssn: owner.ssn,
        phoneNumber: owner.mobileNumber,
        emailAddress: owner.email,
        driverLicenseNumber: index === 0 ? client.driverLicense : undefined,
        ownerId: owner.id || owner._id || undefined,
        address: {
            street: [owner.address?.address1, owner.address?.address2].filter(Boolean).join(' '),
            city: owner.address?.city,
            state: owner.address?.state,
            zipCode: owner.address?.zipCode,
            country: 'USA',
        },
    }));
    const primaryOwner = owners[0];
    const businessSubject: ClearBusinessSearchSubject = {
        businessName: client.businessName,
        fein: client.businessEinNumber,
        phoneNumber: client.businessNumber,
        ownerFirstName: primaryOwner?.firstName,
        ownerMiddleName: primaryOwner?.middleName,
        ownerLastName: primaryOwner?.lastName,
        address: {
            street: [client.businessAddress1, client.businessAddress2].filter(Boolean).join(' '),
            city: client.businessCity,
            state: client.businessState,
            zipCode: client.businessZipCode,
            country: 'USA',
        },
    };

    await db.backgroundCheckItem.update({
        where: { id: itemId },
        data: { status: 'IN_PROGRESS' },
    });
    await logEvent(item.backgroundCheckId, 'automated_check_started', {
        itemId,
        detail: { checkType: item.checkType, provider: 'Thomson Reuters CLEAR' },
        actorId: actor?.id,
    });

    try {
        const runnerResult = await runCheck(item.checkType, {
            applicationId: application.id,
            businessSubject,
            subjects,
        });

        let notes = runnerResult.notes ?? '';
        const metadata: Record<string, unknown> = {
            ...((runnerResult.raw && typeof runnerResult.raw === 'object'
                ? runnerResult.raw
                : {}) as Record<string, unknown>),
        };

        // Best-effort CLEAR PDF reports — never fail the search FLAG/PASS outcome.
        try {
            const selected = selectClearReportGroupIds(metadata as any);
            if (selected.businessGroupId || selected.personGroupIds.length > 0) {
                const reportBatch = await fetchClearReportPdfsForSearch(
                    metadata as any,
                    application.id,
                );
                const reportMeta: {
                    attached: Array<{
                        kind: string;
                        groupId: string;
                        reportId: string;
                        fileName: string;
                        hasXml?: boolean;
                    }>;
                    errors: Array<{ kind: string; groupId: string; error: string }>;
                } = { attached: [], errors: reportBatch.errors };

                const pdfUrlByGroupId = new Map<string, string>();
                const lienJudgmentRecords: ClearLienJudgmentRecord[] = [];
                const corporateAssociationRecords: ClearCorporateAssociationRecord[] = [];

                for (const report of reportBatch.attached) {
                    const uploaded = await uploadService.uploadBuffer(
                        report.pdf,
                        'ih-crm/background-checks',
                        report.fileName,
                    );
                    if (!uploaded.success || !uploaded.data) {
                        reportMeta.errors.push({
                            kind: report.kind,
                            groupId: report.groupId,
                            error: String(uploaded.error || uploaded.message || 'Upload failed').slice(0, 500),
                        });
                        continue;
                    }
                    await addAttachment(
                        itemId,
                        {
                            url: uploaded.data.secure_url,
                            publicId: uploaded.data.public_id,
                            originalName: report.fileName,
                        },
                        actor,
                    );
                    pdfUrlByGroupId.set(report.groupId, uploaded.data.secure_url);
                    reportMeta.attached.push({
                        kind: report.kind,
                        groupId: report.groupId,
                        reportId: report.reportId,
                        fileName: report.fileName,
                        hasXml: Boolean(report.xml),
                    });

                    if (report.xmlError) {
                        reportMeta.errors.push({
                            kind: report.kind,
                            groupId: report.groupId,
                            error: `CLEAR report XML: ${report.xmlError}`.slice(0, 500),
                        });
                    }
                    if (report.xml) {
                        try {
                            const parsedLiens = parseClearLienJudgmentRecords(report.xml, {
                                groupId: report.groupId,
                                reportKind: report.kind,
                            });
                            lienJudgmentRecords.push(...parsedLiens);
                            if (
                                parsedLiens.length === 0 &&
                                /Lien|Judg|Warrant/i.test(report.xml)
                            ) {
                                const tags = inventoryClearLienJudgmentTags(report.xml).slice(0, 40);
                                reportMeta.errors.push({
                                    kind: report.kind,
                                    groupId: report.groupId,
                                    error: `CLEAR Lien/Judgment parse: 0 rows from XML that mentions liens/judgments; tags=${tags.join(',') || 'none'}`.slice(
                                        0,
                                        500,
                                    ),
                                });
                            }
                        } catch (parseError: any) {
                            reportMeta.errors.push({
                                kind: report.kind,
                                groupId: report.groupId,
                                error: `CLEAR Lien/Judgment parse: ${String(parseError?.message || parseError)}`.slice(0, 500),
                            });
                        }
                        try {
                            corporateAssociationRecords.push(
                                ...parseClearCorporateAssociations(report.xml, {
                                    groupId: report.groupId,
                                    reportKind: report.kind,
                                }),
                            );
                        } catch (parseError: any) {
                            reportMeta.errors.push({
                                kind: report.kind,
                                groupId: report.groupId,
                                error: `CLEAR Corporate parse: ${String(parseError?.message || parseError)}`.slice(0, 500),
                            });
                        }
                    }
                }

                metadata.reports = reportMeta;
                metadata.clearLienJudgments = lienJudgmentRecords.map((record) => ({
                    ...record,
                    pdfUrl: pdfUrlByGroupId.get(record.groupId) || undefined,
                }));
                metadata.clearCorporateAssociations = corporateAssociationRecords;

                if (reportMeta.attached.length > 0) {
                    notes = `${notes}${notes ? ' ' : ''}CLEAR PDF report(s) attached.`.trim();
                }
                if (lienJudgmentRecords.length > 0) {
                    const judgmentCount = lienJudgmentRecords.filter((r) => r.kind === 'judgment').length;
                    const lienCount = lienJudgmentRecords.filter((r) => r.kind === 'lien').length;
                    notes = `${notes}${notes ? ' ' : ''}CLEAR Lien/Judgment records ready for review (${judgmentCount} judgment(s), ${lienCount} lien(s)).`.trim();
                }
                if (corporateAssociationRecords.length > 0) {
                    const primaryBusinessName = String(client.businessName ?? '').trim();
                    const clearCompanyNames = uniqueClearCorporateNames(
                        corporateAssociationRecords,
                        primaryBusinessName ? [primaryBusinessName] : [],
                    );
                    notes = `${notes}${notes ? ' ' : ''}CLEAR corporation association(s): ${clearCompanyNames.length}.`.trim();
                }
                if (reportMeta.errors.length > 0) {
                    const firstError = String(reportMeta.errors[0]?.error || '').trim();
                    const pdfFailed = reportMeta.attached.length === 0;
                    notes = `${notes}${notes ? ' ' : ''}${
                        pdfFailed
                            ? `CLEAR PDF report generation failed for ${reportMeta.errors.length} report(s); search result unchanged.`
                            : `CLEAR report follow-up note(s): ${reportMeta.errors.length}.`
                    }${firstError ? ` ${firstError}` : ''}`.trim();
                }
            }
        } catch (reportError: any) {
            metadata.reports = {
                attached: [],
                errors: [{
                    kind: 'batch',
                    groupId: '',
                    error: String(reportError?.message || reportError).slice(0, 500),
                }],
            };
            notes = `${notes}${notes ? ' ' : ''}CLEAR PDF report generation failed; search result unchanged.`.trim();
        }

        await updateItem(itemId, {
            status: 'COMPLETE',
            result: runnerResult.result,
            notes,
            metadata,
        }, actor);
        await logEvent(item.backgroundCheckId, 'automated_check_completed', {
            itemId,
            fromStatus: item.status,
            toStatus: 'COMPLETE',
            detail: {
                checkType: item.checkType,
                result: runnerResult.result,
                provider: 'Thomson Reuters CLEAR',
            },
            actorId: actor?.id,
        });
        return getCheck(item.backgroundCheckId);
    } catch (error: any) {
        await logEvent(item.backgroundCheckId, 'automated_check_failed', {
            itemId,
            fromStatus: item.status,
            toStatus: 'IN_PROGRESS',
            detail: {
                checkType: item.checkType,
                provider: 'Thomson Reuters CLEAR',
                message: String(error?.message || 'CLEAR request failed').slice(0, 500),
            },
            actorId: actor?.id,
        });
        throw new BackgroundCheckError(
            error?.message || 'Thomson Reuters CLEAR request failed.',
            502,
        );
    }
}

async function getCheck(backgroundCheckId: string) {
    return db.backgroundCheck.findUnique({ where: { id: backgroundCheckId }, include: fullInclude });
}

async function addAttachment(
    itemId: string,
    file: { url: string; publicId?: string; originalName?: string },
    actor: Actor,
) {
    const item = await db.backgroundCheckItem.findUnique({ where: { id: itemId } });
    if (!item) throw new BackgroundCheckError('Check item not found', 404);
    if (!file?.url) throw new BackgroundCheckError('Attachment url is required');
    await db.backgroundCheckAttachment.create({
        data: { itemId, url: file.url, publicId: file.publicId ?? null, originalName: file.originalName ?? null, uploadedById: actor?.id ?? null },
    });
    await logEvent(item.backgroundCheckId, 'attachment_added', { itemId, detail: { originalName: file.originalName }, actorId: actor?.id });
    return getCheck(item.backgroundCheckId);
}

/** Everything on a CLEAR item that came from a run, as opposed to what a user typed. */
const CLEAR_RUN_METADATA_KEYS = [
    'provider',
    'operations',
    'searchedAt',
    'ownerCount',
    'groupCount',
    'businessSearch',
    'personSearches',
    'reports',
    'clearLienJudgments',
    'clearCorporateAssociations',
];

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

/** CLEAR groups whose findings were parsed out of the PDF being removed. */
function reportGroupIdsForFile(
    metadata: Record<string, unknown>,
    fileName: string,
): Set<string> {
    const attached = asRecord(metadata.reports)?.attached;
    if (!fileName || !Array.isArray(attached)) return new Set();
    return new Set(
        attached
            .filter((row) => String(asRecord(row)?.fileName ?? '').trim() === fileName)
            .map((row) => String(asRecord(row)?.groupId ?? '').trim())
            .filter(Boolean),
    );
}

/**
 * A CLEAR PDF is the source of the liens, judgments, and corporations parsed out of
 * it, so removing the PDF removes those findings too. Removing the last CLEAR PDF
 * clears the whole run — matches, findings, and notes — leaving the check ready to
 * run again. Notes and images a user typed are left alone.
 */
async function forgetClearReportInItemMetadata(
    item: { id: string; checkType: string; metadata?: unknown },
    attachment: { url: string; originalName?: string | null },
    attachmentsLeft: number,
) {
    const source = asRecord(item.metadata);
    if (!source) return;
    if (item.checkType !== 'TLO') return;
    if (!CLEAR_RUN_METADATA_KEYS.some((key) => source[key] !== undefined)) return;

    if (attachmentsLeft === 0) {
        const metadata = { ...source };
        for (const key of CLEAR_RUN_METADATA_KEYS) delete metadata[key];
        await db.backgroundCheckItem.update({
            where: { id: item.id },
            data: {
                metadata,
                notes: '',
                result: null,
                status: 'NOT_STARTED',
                performedById: null,
                performedAt: null,
            },
        });
        return;
    }

    const metadata = { ...source };
    const fileName = String(attachment.originalName ?? '').trim();
    const groupIds = reportGroupIdsForFile(metadata, fileName);
    let changed = false;

    if (Array.isArray(metadata.clearLienJudgments)) {
        const rows = metadata.clearLienJudgments;
        const next = rows.filter((row) => {
            const record = asRecord(row);
            if (!record) return true;
            if (record.pdfUrl === attachment.url) return false;
            return !groupIds.has(String(record.groupId ?? '').trim());
        });
        if (next.length !== rows.length) {
            metadata.clearLienJudgments = next;
            changed = true;
        }
    }

    if (Array.isArray(metadata.clearCorporateAssociations) && groupIds.size > 0) {
        const rows = metadata.clearCorporateAssociations;
        const next = rows.filter(
            (row) => !groupIds.has(String(asRecord(row)?.groupId ?? '').trim()),
        );
        if (next.length !== rows.length) {
            metadata.clearCorporateAssociations = next;
            changed = true;
        }
    }

    const reports = asRecord(metadata.reports);
    if (fileName && Array.isArray(reports?.attached)) {
        const next = reports.attached.filter(
            (row) => String(asRecord(row)?.fileName ?? '').trim() !== fileName,
        );
        if (next.length !== reports.attached.length) {
            metadata.reports = { ...reports, attached: next };
            changed = true;
        }
    }

    if (changed) {
        await db.backgroundCheckItem.update({ where: { id: item.id }, data: { metadata } });
    }
}

async function removeAttachment(attachmentId: string, actor: Actor) {
    const att = await db.backgroundCheckAttachment.findUnique({ where: { id: attachmentId }, include: { item: true } });
    if (!att) throw new BackgroundCheckError('Attachment not found', 404);
    await db.backgroundCheckAttachment.delete({ where: { id: attachmentId } });
    if (att.publicId) {
        // The row is already gone, so a stranded Cloudinary asset must not fail the removal.
        const deleted = await uploadService.deleteFile(att.publicId, 'raw');
        if (!deleted?.success) {
            console.error('[backgroundCheck] Cloudinary delete failed:', deleted?.error || deleted?.message);
        }
    }
    const attachmentsLeft = await db.backgroundCheckAttachment.count({
        where: { itemId: att.itemId },
    });
    await forgetClearReportInItemMetadata(att.item, att, attachmentsLeft);
    await logEvent(att.item.backgroundCheckId, 'attachment_removed', {
        itemId: att.itemId,
        detail: { originalName: att.originalName, clearRunCleared: attachmentsLeft === 0 },
        actorId: actor?.id,
    });
    await recomputeStatus(att.item.backgroundCheckId, actor?.id);
    return getCheck(att.item.backgroundCheckId);
}

/**
 * Copy CLEAR corporation names into empty Exhibit A slots on the deal's contract.
 * Explicit rather than part of the CLEAR run so an underwriter decides when the
 * contract changes.
 */
async function mapClearCorporationsToExhibit(itemId: string, actor: Actor) {
    if (!DECIDER_ROLES.includes(norm(actor?.role))) {
        throw new BackgroundCheckError('You are not authorized to update Exhibit A.', 403);
    }

    const item = await db.backgroundCheckItem.findUnique({
        where: { id: itemId },
        include: {
            backgroundCheck: {
                include: { application: { include: { client: true } } },
            },
        },
    });
    if (!item) throw new BackgroundCheckError('Check item not found', 404);
    if (item.checkType !== 'TLO') {
        throw new BackgroundCheckError('Only the CLEAR check carries corporation names.');
    }

    const application = item.backgroundCheck?.application;
    if (!application) throw new BackgroundCheckError('Application data is unavailable.', 404);

    const metadata =
        item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
            ? (item.metadata as Record<string, unknown>)
            : {};
    const records = Array.isArray(metadata.clearCorporateAssociations)
        ? (metadata.clearCorporateAssociations as ClearCorporateAssociationRecord[])
        : [];
    const primaryBusinessName = String(application.client?.businessName ?? '').trim();
    const clearCompanyNames = uniqueClearCorporateNames(
        records,
        primaryBusinessName ? [primaryBusinessName] : [],
    );
    if (clearCompanyNames.length === 0) {
        throw new BackgroundCheckError('Run CLEAR first — no corporation names are available to map.');
    }

    const contract = await db.contract.findFirst({
        where: { applicationId: application.id },
        select: { id: true, contractPrefillOverrides: true },
    });
    if (!contract) {
        throw new BackgroundCheckError('This deal has no contract yet, so Exhibit A cannot be filled.');
    }

    const existingOverrides =
        contract.contractPrefillOverrides &&
        typeof contract.contractPrefillOverrides === 'object' &&
        !Array.isArray(contract.contractPrefillOverrides)
            ? (contract.contractPrefillOverrides as Record<string, unknown>)
            : {};
    const merged = mergeClearNamesIntoExhibitPrefill(existingOverrides, clearCompanyNames);
    if (merged.added > 0) {
        await db.contract.update({
            where: { id: contract.id },
            data: { contractPrefillOverrides: merged.overrides },
        });
    }
    await logEvent(item.backgroundCheckId, 'exhibit_mapped', {
        itemId,
        detail: { added: merged.added, names: merged.names, contractId: contract.id },
        actorId: actor?.id,
    });

    return {
        added: merged.added,
        names: merged.names,
        candidates: clearCompanyNames,
        contractId: contract.id,
        check: await getCheck(item.backgroundCheckId),
    };
}

async function setRequiredFlags(backgroundCheckId: string, flags: Record<string, boolean>, actor: Actor) {
    if (!OVERRIDE_ROLES.includes(norm(actor?.role))) {
        throw new BackgroundCheckError('Only an Admin can configure required checks.', 403);
    }
    const items = await db.backgroundCheckItem.findMany({ where: { backgroundCheckId } });
    for (const item of items as any[]) {
        if (flags[item.checkType] !== undefined) {
            await db.backgroundCheckItem.update({ where: { id: item.id }, data: { required: Boolean(flags[item.checkType]) } });
        }
    }
    await logEvent(backgroundCheckId, 'required_updated', { detail: flags, actorId: actor?.id });
    await recomputeStatus(backgroundCheckId, actor?.id);
    return getCheck(backgroundCheckId);
}

async function recordDecision(
    backgroundCheckId: string,
    body: { outcome?: string; reasonCode?: string; reasonText?: string; conditionsText?: string; overrideFail?: boolean },
    actor: Actor,
) {
    const role = norm(actor?.role);
    if (!DECIDER_ROLES.includes(role)) {
        throw new BackgroundCheckError('You are not authorized to decide background checks.', 403);
    }
    const outcome = String(body.outcome || '').trim().toUpperCase();
    if (outcome !== 'APPROVED' && outcome !== 'DECLINED') {
        throw new BackgroundCheckError('outcome must be APPROVED or DECLINED');
    }
    const reasonText = String(body.reasonText || '').trim();
    if (!reasonText) throw new BackgroundCheckError('A reason is required to record a decision.');

    const check = await db.backgroundCheck.findUnique({
        where: { id: backgroundCheckId },
        include: { items: true, decision: true },
    });
    if (!check) throw new BackgroundCheckError('Background check not found', 404);
    if (check.decision) throw new BackgroundCheckError('A decision already exists. Reopen the check to change it.');
    if (check.status !== 'READY_FOR_DECISION') {
        throw new BackgroundCheckError('All required checks must be completed before a decision.');
    }

    const hasFail = (check.items as any[]).some((i) => i.result === 'FAIL');
    let overrodeFail = false;
    if (outcome === 'APPROVED' && hasFail) {
        if (!OVERRIDE_ROLES.includes(role) || !body.overrideFail) {
            throw new BackgroundCheckError('A failed check blocks approval. Only a Manager can override, with a reason.', 403);
        }
        overrodeFail = true;
    }

    await db.backgroundCheckDecision.create({
        data: {
            backgroundCheckId,
            outcome,
            reasonCode: body.reasonCode ? String(body.reasonCode) : null,
            reasonText,
            conditionsText: body.conditionsText ? String(body.conditionsText) : null,
            overrodeFail,
            decidedById: actor?.id ?? null,
        },
    });
    await db.backgroundCheck.update({ where: { id: backgroundCheckId }, data: { status: outcome } });
    await logEvent(backgroundCheckId, 'decision', {
        fromStatus: 'READY_FOR_DECISION',
        toStatus: outcome,
        detail: { reasonText, overrodeFail, hasFail },
        actorId: actor?.id,
    });
    return getCheck(backgroundCheckId);
}

async function reopen(backgroundCheckId: string, actor: Actor) {
    if (!OVERRIDE_ROLES.includes(norm(actor?.role))) {
        throw new BackgroundCheckError('Only an Admin can reopen a decided check.', 403);
    }
    const check = await db.backgroundCheck.findUnique({ where: { id: backgroundCheckId }, include: { decision: true } });
    if (!check) throw new BackgroundCheckError('Background check not found', 404);
    if (check.decision) await db.backgroundCheckDecision.delete({ where: { id: check.decision.id } });
    await db.backgroundCheck.update({ where: { id: backgroundCheckId }, data: { status: 'IN_PROGRESS' } });
    await logEvent(backgroundCheckId, 'reopened', { fromStatus: check.status, toStatus: 'IN_PROGRESS', actorId: actor?.id });
    await recomputeStatus(backgroundCheckId, actor?.id);
    return getCheck(backgroundCheckId);
}

/** The contract gate: true only when the deal's background check is APPROVED. */
async function isContractEligible(applicationId: string): Promise<boolean> {
    const check = await db.backgroundCheck.findUnique({
        where: { applicationId },
        select: { status: true },
    });
    return check?.status === 'APPROVED';
}

export const backgroundCheckService = {
    CHECK_TYPES,
    DECIDER_ROLES,
    OVERRIDE_ROLES,
    getByApplication,
    getOrCreateForApplication,
    runCompanyResearch,
    getCheck,
    updateItem,
    runAutomatedItem,
    addAttachment,
    removeAttachment,
    mapClearCorporationsToExhibit,
    setRequiredFlags,
    recordDecision,
    reopen,
    isContractEligible,
};
export default backgroundCheckService;
