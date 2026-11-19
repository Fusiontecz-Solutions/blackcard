import axios from 'axios';
import type { BoldSignUserInfoResponse, OAuthTokenResponse } from '../../types/oauth-api';
import dotenv from 'dotenv';
import prisma from '../../config/prismaClient';
import { Client, Prisma } from '@prisma/client';
import { toPrefillUppercase } from '../docusign/utils/prefill-uppercase';
import { resolveDocumentOwnerNumericUserId } from '../../middleware/authMiddleware';

import {
  BOLDSIGN_API_BASE,
  BOLDSIGN_AUTH_BASE,
  BOLDSIGN_API_KEY,
  BOLDSIGN_CLIENT_ID,
  BOLDSIGN_CLIENT_SECRET,
  BOLDSIGN_REDIRECT_URI,
  createBoldSignApiClient,
  createBoldSignApiKeyClient,
} from './utils/boldsign-client';

import { STATE_DOCUMENT_CONFIG } from './state-document-config';
import { FUNDERNAME_DOCUMENT_CONFIG } from './funderName-document-config';
import { PAYOFF_DOCUMENT_CONFIG } from './payoff-document-config';
import { ADDENDUM_DOCUMENT_CONFIG } from './addendum-document-config';
import { EPO_DOCUMENT_CONFIG } from './epo-document-config';
import { ACH_DOCUMENT_CONFIG } from './ach-document-config';

import {
  mergeWithExistingEnvelopeStatus,
  parseWebhookPayload,
  resolveBoldSignWebhookEnvelopeStatus,
} from './utils/boldsign-webhook';
import sendMail, { isOutboundSmtpConfigured } from '../../config/nodemailer';
import { withMandatoryCcList } from '../../config/mandatoryCc';
import { logDealEmail } from '../dealMailLog';

/** Maps webhook / envelope strings to `Contract.status` enum values (Prisma `ContractStatus`). */
function internalEnvelopeStatusToContractStatusDbValue(
  internal: string,
): string | null {
  const map: Record<string, string> = {
    draft: 'DRAFT',
    sent: 'SENT',
    viewed: 'VIEWED',
    signed: 'SIGNED',
    completed: 'COMPLETED',
    declined: 'DECLINED',
    revoked: 'REVOKED',
    expired: 'EXPIRED',
    reassigned: 'SENT',
    authentication_failed: 'SENT',
  };
  return map[internal] ?? null;
}

dotenv.config();

// ─── Custom error classes ─────────────────────────────────────────────────────
class UnauthorizedException extends Error {
  status = 401;
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedException';
  }
}

class BadRequestException extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BadRequestException';
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatNumberUS(value: string | number, minDecimals = 2, maxDecimals = 20): string {
  if (!value || value.toString().trim() === '') return '';
  const num = parseFloat(value.toString().replace(/,/g, ''));
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US', { minimumFractionDigits: minDecimals, maximumFractionDigits: maxDecimals });
}

function withDollar(value: string): string {
  if (!value || value.trim() === '') return value || '';
  const formatted = formatNumberUS(value);
  if (!formatted) return value.startsWith('$') ? value : `$${value}`;
  return `$${formatted}`;
}

function formatPercentage(value: string): string {
  if (!value || value.toString().trim() === '') return '';
  return formatNumberUS(value) || '';
}

function getStateAbbreviation(stateName: string): string {
  if (!stateName) return '';
  const upper = stateName.toUpperCase().trim();
  const map: Record<string, string> = {
    CALIFORNIA: 'CA', FLORIDA: 'FL', GEORGIA: 'GA', KANSAS: 'KS',
    CONNECTICUT: 'CT', 'NEW YORK': 'NY', UTAH: 'UT', VIRGINIA: 'VA',
  };
  if (upper.length === 2) return upper;
  return map[upper] || upper;
}

function formatEinNumber(ein: string): string {
  const cleaned = ein.replace(/\D/g, '');
  if (cleaned.length === 9) return cleaned.replace(/^(\d{2})(\d{7})$/, '$1-$2');
  return ein;
}

function formatSsnNumber(ssn: string): string {
  const cleaned = ssn.replace(/\D/g, '');
  if (cleaned.length === 9) return cleaned.replace(/^(\d{3})(\d{2})(\d{4})$/, '$1-$2-$3');
  return ssn;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US');
}

/**
 * Walks document `properties` and maps normalized field keys → BoldSign canonical `Id`
 * (exact casing/spacing from the API). Prefill PATCH must use canonical ids; CRM often sends
 * snake_case while templates use different casing — without this, most values are dropped and
 * CC/signer PDFs look "empty" except rare matches (e.g. entity_type).
 */
/** CRM prefill ids → alternate normalized keys on BoldSign templates (e.g. snake_case vs PascalCase). */
const BOLDSIGN_PREFILL_CRM_ID_ALIASES: Record<string, string[]> = {
  net_to_merchant: ['netfundprovided'],
  frequency: ['paymentterms'],
};

function buildBoldSignPrefillCanonicalIdMap(data: unknown): Map<string, string> | null {
  const map = new Map<string, string>();
  const registerKeysForCanonical = (canonical: string): void => {
    const c = canonical.trim();
    if (!c) return;
    const lower = c.toLowerCase();
    const underscored = lower.replace(/\s+/g, '_');
    const spaced = lower.replace(/_/g, ' ');
    for (const k of new Set([lower, underscored, spaced])) {
      if (k) map.set(k, c);
    }
  };
  const addField = (f: Record<string, unknown>): void => {
    const raw =
      f.id ??
      f.Id ??
      f.fieldId ??
      f.FieldId ??
      f.name ??
      f.Name ??
      f.fieldName ??
      f.FieldName;
    if (typeof raw !== 'string' || !raw.trim()) return;
    registerKeysForCanonical(raw);
  };
  const visit = (node: unknown): void => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object') return;
    const rec = node as Record<string, unknown>;
    for (const [key, val] of Object.entries(rec)) {
      const normKey = key.replace(/\s/g, '').toLowerCase();
      const isFormFieldArray =
        (normKey === 'formfields' ||
          normKey === 'documentformfields' ||
          normKey === 'editableformfields') &&
        Array.isArray(val);
      if (isFormFieldArray) {
        for (const item of val) {
          if (item && typeof item === 'object') {
            addField(item as Record<string, unknown>);
          }
        }
      }
      visit(val);
    }
  };
  visit(data);
  return map.size > 0 ? map : null;
}

/**
 * BoldSign REST JSON expects `CC` with `EmailAddress` (PascalCase).
 * Sending `cc` / `emailAddress` is ignored, so CC recipients never receive mail.
 */
function boldSignDocumentCCList(
  ccEmails?: string[] | null,
): Array<{ EmailAddress: string }> | undefined {
  // Always-copied addresses (config/mandatoryCc) ride on every envelope.
  const list = withMandatoryCcList(ccEmails)
    .map((e) => String(e ?? '').trim())
    .filter(Boolean);
  if (!list.length) return undefined;
  return list.map((email) => ({ EmailAddress: email }));
}

/** BoldSign `PageViewOption` accepts `PreparePage` | `FillingPage`; clients may send legacy `"Prepare"`. */
function normalizeBoldSignSendViewOption(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim();
  if (s === "Prepare") return "PreparePage";
  if (!s) return "PreparePage";
  return s;
}

// ─── BoldSign Service ─────────────────────────────────────────────────────────
export class BoldSignService {

  // ──────────── OAuth ────────────

  /** Build the BoldSign OAuth authorization URL */
  getAuthUrl(state: string): string {
    const scopes = 'BoldSign.Documents.All BoldSign.Templates.All';
    return (
      `${BOLDSIGN_AUTH_BASE}/oauth/auth` +
      `?response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&client_id=${BOLDSIGN_CLIENT_ID}` +
      `&state=${state}` +
      `&redirect_uri=${encodeURIComponent(BOLDSIGN_REDIRECT_URI)}`
    );
  }

  /** Exchange authorization code for tokens and persist to the User record */
  async handleCallback(code: string, userId: string) {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'authorization_code');
      params.append('code', code);
      params.append('client_id', BOLDSIGN_CLIENT_ID);
      params.append('client_secret', BOLDSIGN_CLIENT_SECRET);
      params.append('redirect_uri', BOLDSIGN_REDIRECT_URI);

      const response = await axios.post<OAuthTokenResponse>(
        `${BOLDSIGN_AUTH_BASE}/oauth/token`,
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      if (!response.data?.access_token) {
        throw new Error('Invalid response from BoldSign: Missing access token');
      }

      const { access_token, refresh_token, expires_in } = response.data;

      // Fetch user info from BoldSign to get account details
      const userInfoRes = await axios.get<BoldSignUserInfoResponse>(
        `${BOLDSIGN_AUTH_BASE}/oauth/userinfo`,
        {
          headers: { Authorization: `Bearer ${access_token}` },
        },
      );
      const defaultAccount = userInfoRes.data.accounts?.find((acc) => acc.is_default);

      const tokenExpiry = expires_in
        ? new Date(Date.now() + expires_in * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await prisma.user.update({
        where: { id: userId },
        data: {
          docusignAccessToken: access_token,
          docusignRefreshToken: refresh_token || null,
          docusignTokenExpiry: tokenExpiry,
          docusignAccountId: defaultAccount?.account_id || null,
          docusignBaseUri: defaultAccount?.base_uri || BOLDSIGN_API_BASE,
        } as any,
      });

      return { success: true };
    } catch (error: any) {
      throw new UnauthorizedException('Failed to get BoldSign tokens: ' + (error?.message || error));
    }
  }

  /** Refresh an expired access token */
  async refreshToken(userId: string) {
    if (BOLDSIGN_API_KEY) {
      return { success: true };
    }
    const user: any = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.docusignRefreshToken) {
      throw new UnauthorizedException('No refresh token available');
    }

    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'refresh_token');
      params.append('refresh_token', user.docusignRefreshToken);
      params.append('client_id', BOLDSIGN_CLIENT_ID);
      params.append('client_secret', BOLDSIGN_CLIENT_SECRET);

      const response = await axios.post<OAuthTokenResponse>(
        `${BOLDSIGN_AUTH_BASE}/oauth/token`,
        params,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      const { access_token, refresh_token, expires_in } = response.data;

      await prisma.user.update({
        where: { id: userId },
        data: {
          docusignAccessToken: access_token,
          docusignRefreshToken: refresh_token,
          docusignTokenExpiry: new Date(Date.now() + (expires_in ?? 86400) * 1000),
        } as any,
      });

      return { success: true };
    } catch (error: any) {
      throw new UnauthorizedException('Failed to refresh BoldSign token: ' + (error?.message || error));
    }
  }

  // ──────────── Token helper ────────────

  /** Ensure the user has a valid access token, refreshing if needed */
  private async getValidUser(userId: string) {
    if (BOLDSIGN_API_KEY) {
      return null;
    }

    let user: any = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.docusignAccessToken) {
      throw new UnauthorizedException('BoldSign not connected');
    }

    const isTokenExpired =
      user.docusignTokenExpiry &&
      new Date(user.docusignTokenExpiry).getTime() - 5 * 60 * 1000 < Date.now();

    if (isTokenExpired && user.docusignRefreshToken) {
      await this.refreshToken(userId);
      user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user?.docusignAccessToken) throw new Error('Token refresh failed');
    }

    return user;
  }

  /** Resolve BoldSign API client: API-key mode first, then OAuth fallback */
  // private async getApiClient(userId: string) {
  //   console.log("BOLDSIGN_API_KEYyyyyyyyyy", BOLDSIGN_API_KEY);
  //   if (BOLDSIGN_API_KEY) {
  //     return createBoldSignApiKeyClient();
  //   }
  //   const user = await this.getValidUser(userId);
  //   console.log("user", user);
  //   return createBoldSignApiClient(user.docusignAccessToken);

  // }



  // ──────────── Base64 / PDF helpers ────────────

  private async getApiClient(userId: string) {
    return createBoldSignApiKeyClient();
  }

  private validateAndCleanBase64(base64String: string): string {
    const base64Data = base64String.replace(/^data:application\/pdf;base64,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
      throw new BadRequestException('Invalid base64 string format');
    }
    const decodedLength = Math.ceil((base64Data.length * 3) / 4);
    if (decodedLength < 100) {
      throw new BadRequestException('Document appears to be too small to be a valid PDF');
    }
    return base64Data;
  }

  private getPdfPageCount(base64String: string): number {
    try {
      const buffer = Buffer.from(base64String, 'base64');
      const pdfText = buffer.toString('binary');
      const countMatches = pdfText.match(/\/Count\s+(\d+)/g);
      if (countMatches?.length) {
        const last = countMatches[countMatches.length - 1];
        const count = parseInt(last.match(/\d+/)?.[0] || '0');
        if (count > 0) return count;
      }
      const pageMatches = pdfText.match(/\/Type\s*\/Page[^s]/g);
      return pageMatches?.length || 0;
    } catch {
      return 0;
    }
  }

  // ──────────── Core document operations ────────────
  /**
   * Send a document for e-signing via BoldSign using API-key auth.
   * Builds a multipart/form-data request matching BoldSign's /v1/document/send endpoint.
   *
   * @param fileBuffer  – PDF file as a Buffer (from multer or converted from base64)
   * @param options     – Signer details, CC recipients, and other document options
   */
  async sendDocumentForSigning(
    userId: string,
    fileBuffer: Buffer,
    options: {
      title?: string;
      message?: string;
      signerName: string;
      signerEmail: string;
      // authenticationCode?: string;
      // authenticationType?: string;
      ccEmails?: string[];
    },
  ) {
    const apiClient = await this.getApiClient(userId);

    const FormData = (await import('form-data')).default;
    const form = new FormData();

    // ── Attach the PDF file ───
    form.append('Files', fileBuffer, {
      filename: 'document.pdf',
      contentType: 'application/pdf',
    });

    // ── Document-level fields ───
    form.append('Title', options.title || 'Commercial Agreement');
    form.append('Message', options.message || 'Terms, purpose and duration of agreement');
    form.append('EnableSigningOrder', 'true');
    form.append('DocumentDownloadOption', 'Combined');
    form.append('DisableSMS', 'false');

    // ── Signer fields (index 0) ───
    form.append('Signers[0][Name]', options.signerName);
    form.append('Signers[0][EmailAddress]', options.signerEmail);
    form.append('Signers[0][SignerOrder]', '1');
    form.append('Signers[0][Locale]', 'EN');
    form.append('Signers[0][DeliveryMode]', 'Email');

    // Authentication (access code)
    // if (options.authenticationCode) {
    //   form.append('Signers[0][authenticationCode]', options.authenticationCode);
    //   form.append(
    //     'Signers[0][authenticationType]',
    //     options.authenticationType || 'AccessCode',
    //   );
    // }

    // ── Signer form-field: Signature ───
    form.append('Signers[0][FormFields][0][FieldType]', 'Signature');
    form.append('Signers[0][FormFields][0][Name]', 'sign_field');
    form.append('Signers[0][FormFields][0][PageNumber]', '1');
    form.append('Signers[0][FormFields][0][Bounds][X]', '50');
    form.append('Signers[0][FormFields][0][Bounds][Y]', '50');
    form.append('Signers[0][FormFields][0][Bounds][Width]', '200');
    form.append('Signers[0][FormFields][0][Bounds][Height]', '30');
    form.append('Signers[0][FormFields][0][IsRequired]', 'true');
    form.append('Signers[0][FormFields][0][CharacterSpacing]', '0');

    // ── CC recipients ─── (plus the always-copied addresses, config/mandatoryCc)
    const envelopeCc = withMandatoryCcList(options.ccEmails);
    if (envelopeCc.length) {
      envelopeCc.forEach((email, idx) => {
        form.append(`CC[${idx}].EmailAddress`, email);
      });
    }

    try {
      const response = await apiClient.post('/v1/document/send', form, {
        headers: { ...form.getHeaders() },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      return {
        success: true,
        documentId: response.data?.documentId,
        message: 'Document sent for signing',
        data: response.data,
      };
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new UnauthorizedException(
          'BoldSign authentication failed. Please reconnect.',
        );
      }
      if (error?.response?.status === 400) {
        throw new BadRequestException(
          `BoldSign validation error: ${JSON.stringify(error.response.data)}`,
        );
      }
      throw new BadRequestException(
        'Failed to send document: ' + (error?.message || error),
      );
    }
  }


  async sendTemplate(
    userId: string,
    options: {
      templateId?: string;
      redirectUrl?: string;
      showToolbar?: boolean;
      sendViewOption?: string;
      showSaveButton?: boolean;
      showSendButton?: boolean;
      showPreviewButton?: boolean;
      showNavigationButtons?: boolean;
      sendLinkValidTill?: string;
      title?: string;
      message?: string;
      roles?: Array<{
        roleIndex?: number;
        signerName: string;
        signerEmail: string;
        signerOrder?: number;
        privateMessage?: string;
        authenticationCode?: string;
        authenticationType?: string;
        deliveryMode?: string;
        signerType?: string;
        signerRole?: string;
        locale?: string;
      }>;
      signerName?: string;
      signerEmail?: string;
      labels?: string[];
      reminderSettings?: {
        enableAutoReminder?: boolean;
        reminderDays?: number;
        reminderCount?: number;
      };
      prefillFields?: Array<{ id: string; value: string }>;
      ccEmails?: string[];
      // expiryDays?: number;
      // expiryDateType?: string;
      // expiryValue?: number;
      // disableExpiryAlert?: boolean;
      // enablePrintAndSign?: boolean;
      // enableReassign?: boolean;
      roleRemovalIndices?: number[];
      /** CRM application UUID — links BoldSign documentId to `Document` / `Contract` for webhooks. */
      applicationId?: string;
    },
  ) {
    const apiClient = await this.getApiClient(userId);

    const templateId = options.templateId || '50deb96f-c5da-44b7-9a97-90397deaa29c';

    // ── Build roles array SAFELY ───
    let roles: any[];
    if (options.roles?.length) {
      roles = options.roles.map((r) => ({
        roleIndex: r.roleIndex ?? 1,
        // ✅ FIX: Force strings so JSON.stringify NEVER strips the keys
        signerName: String(r.signerName || ""),
        signerEmail: String(r.signerEmail || ""),
        signerOrder: r.signerOrder ?? 1,
        privateMessage: r.privateMessage || "",
        authenticationCode: r.authenticationCode || "",
        authenticationType: r.authenticationType || "AccessCode",
        deliveryMode: r.deliveryMode || "Email",
        signerType: r.signerType && /^signer$/i.test(String(r.signerType).trim()) ? "Signer" : r.signerType || "Signer",
        signerRole: r.signerRole || "",
        locale: r.locale || "EN",
      }));
    } else {
      roles = [
        {
          roleIndex: 1,
          signerName: options.signerName || "",
          signerEmail: options.signerEmail || "",
          signerOrder: 1,
          deliveryMode: "Email",
          signerType: "Signer",
          locale: "EN",
        },
      ];
    }

    // ✅ FIX: Final validation before hitting BoldSign API
    const validRoles = roles.filter((r) => r.signerEmail.trim() !== "");
    if (validRoles.length === 0) {
      throw new BadRequestException("At least one signer with a valid email is required to send to BoldSign.");
    }

    // Step 1 payload: send document from template
    const sendPayload: Record<string, any> = {
      title: options.title || "LLC Operating Agreement",
      message: options.message || "An LLC operating agreement is a legal document that governs the affairs, management, and ownership of a company.",
      roles: validRoles, // ✅ FIX: Send ONLY valid roles to BoldSign
      // ✅ ENSURE status: "Draft" is NOT here
      // expiryDays: options.expiryDays ?? 10,
      // expiryDateType: options.expiryDateType || "Days",
      // expiryValue: options.expiryValue ?? 60,
      // disableExpiryAlert: options.disableExpiryAlert ?? true,
      // enablePrintAndSign: options.enablePrintAndSign ?? true,
      // enableReassign: options.enableReassign ?? true,
    };

    if (options.labels?.length) sendPayload.labels = options.labels;
    // CC list is emailed from the CRM with a prefilled PDF export (BoldSign CC is not a prefilled role).
    if (options.roleRemovalIndices?.length) sendPayload.roleRemovalIndices = options.roleRemovalIndices;
    if (options.reminderSettings) {
      sendPayload.reminderSettings = {
        enableAutoReminder: options.reminderSettings.enableAutoReminder ?? true,
        reminderDays: options.reminderSettings.reminderDays ?? 3,
        reminderCount: options.reminderSettings.reminderCount ?? 5,
      };
    }

    try {
      // 1) Send template -> gets documentId
      // const sendResponse = await apiClient.post(
      //   `/v1/template/send?templateId=${templateId}`,
      //   sendPayload,
      //   { headers: { "Content-Type": "application/json" } },
      // );

      const sendResponse = await apiClient.post(
        `/v1/template/send?templateId=${encodeURIComponent(templateId)}`,
        sendPayload,
        { headers: { "Content-Type": "application/json" } },
      );

      const documentId = sendResponse.data?.documentId;
      if (!documentId) throw new BadRequestException("BoldSign did not return documentId after template send");

      const appId = String(options.applicationId || "").trim();
      if (appId) {
        try {
          const existingDoc = await prisma.document.findUnique({
            where: { applicationId: appId },
            select: { userId: true },
          });
          const documentOwnerUserId = await resolveDocumentOwnerNumericUserId(
            userId,
            appId,
            existingDoc?.userId,
          );
          if (documentOwnerUserId != null) {
            await prisma.document.upsert({
              where: { applicationId: appId },
              create: {
                applicationId: appId,
                envelopeId: String(documentId),
                status: "draft",
                userId: documentOwnerUserId,
              },
              update: {
                envelopeId: String(documentId),
                status: "draft",
                sentAt: null,
                completedAt: null,
              },
            });
          }
        } catch (linkErr) {
          console.error("BoldSign sendTemplate: failed to link document to application", linkErr);
        }
      }

      // 2) Prefill fields
      let prefillResponse: any = null;
      if (options.prefillFields?.length) {
        prefillResponse = await this.prefillFormFields(userId, documentId, options.prefillFields);
      }

      // 2b) Email CC recipients a prefilled PDF (BoldSign CC does not receive role-based prefilled data by design)
      let ccPrefilledEmailResult: { emailed: string[] } | null = null;
      if (options.ccEmails?.length) {
        ccPrefilledEmailResult = await this.emailPrefilledContractPdfToCcRecipients(
          String(documentId),
          options.ccEmails,
          options.title || 'LLC Operating Agreement',
          userId,
          appId,
        );
      }

      // 3) Embedded URL
      const embedPayload: Record<string, any> = {
        redirectUrl: options.redirectUrl || "https://boldsign.com/esignature-api/",
        showToolbar: options.showToolbar ?? true,
        sendViewOption: normalizeBoldSignSendViewOption(options.sendViewOption),
        showSaveButton: options.showSaveButton ?? true,
        showSendButton: options.showSendButton ?? true,
        showPreviewButton: options.showPreviewButton ?? true,
        showNavigationButtons: options.showNavigationButtons ?? true,
      };
      if (options.sendLinkValidTill) embedPayload.sendLinkValidTill = options.sendLinkValidTill;

      const embedResponse = await apiClient.post(
        `/v1/document/createEmbeddedRequestUrl?documentId=${documentId}`,
        embedPayload,
        { headers: { "Content-Type": "application/json" } },
      );

      return {
        success: true,
        documentId,
        sendUrl: embedResponse.data?.sendUrl,
        message: "Document created, prefilled, and embedded URL opened for preview.",
        data: {
          send: sendResponse.data,
          prefill: prefillResponse,
          ccPrefilledEmail: ccPrefilledEmailResult,
          embed: embedResponse.data,
        },
      };
    } catch (error: any) {
      if (error?.response?.status === 401) throw new UnauthorizedException("BoldSign authentication failed.");
      if (error?.response?.status === 400) throw new BadRequestException(`BoldSign validation error: ${JSON.stringify(error.response.data)}`);
      if (error?.response?.status === 404) {
        throw new BadRequestException(
          "BoldSign template not found (404). Check that templateId exists in this BoldSign account and BOLDSIGN_API_BASE matches your region.",
        );
      }
      throw new BadRequestException("Failed to send template: " + (error?.message || error));
    }
  }


  // ──────────── Save Recipients (Fix conditional stripping) ────────────

  // async sendTemplate(
  //   userId: string,
  //   options: {
  //     templateId?: string;
  //     redirectUrl?: string;
  //     showToolbar?: boolean;
  //     sendViewOption?: string;
  //     showSaveButton?: boolean;
  //     showSendButton?: boolean;
  //     showPreviewButton?: boolean;
  //     showNavigationButtons?: boolean;
  //     sendLinkValidTill?: string;
  //     title?: string;
  //     message?: string;
  //     roles?: Array<{
  //       roleIndex?: number;
  //       signerName: string;
  //       signerEmail: string;
  //       signerOrder?: number;
  //       privateMessage?: string;
  //       authenticationCode?: string;
  //       authenticationType?: string;
  //       deliveryMode?: string;
  //       signerType?: string;
  //       signerRole?: string;
  //       locale?: string;
  //     }>;
  //     signerName?: string;
  //     signerEmail?: string;
  //     labels?: string[];
  //     reminderSettings?: {
  //       enableAutoReminder?: boolean;
  //       reminderDays?: number;
  //       reminderCount?: number;
  //     };
  //     prefillFields?: Array<{ id: string; value: string }>;
  //     ccEmails?: string[];
  //     roleRemovalIndices?: number[];
  //     applicationId?: string;
  //   },
  // ) {
  //   const apiClient = await this.getApiClient(userId);

  //   const templateId =
  //     options.templateId || "50deb96f-c5da-44b7-9a97-90397deaa29c";

  //   // ── Build roles ──
  //   let roles: any[];

  //   if (options.roles?.length) {
  //     roles = options.roles.map((r) => ({
  //       roleIndex: r.roleIndex ?? 1,
  //       signerName: String(r.signerName || ""),
  //       signerEmail: String(r.signerEmail || ""),
  //       signerOrder: r.signerOrder ?? 1,
  //       privateMessage: r.privateMessage || "",
  //       authenticationCode: r.authenticationCode || "",
  //       authenticationType: r.authenticationType || "AccessCode",
  //       deliveryMode: r.deliveryMode || "Email",
  //       signerType:
  //         r.signerType && /^signer$/i.test(String(r.signerType).trim())
  //           ? "Signer"
  //           : r.signerType || "Signer",
  //       signerRole: r.signerRole || "",
  //       locale: r.locale || "EN",
  //     }));
  //   } else {
  //     roles = [
  //       {
  //         roleIndex: 1,
  //         signerName: options.signerName || "",
  //         signerEmail: options.signerEmail || "",
  //         signerOrder: 1,
  //         deliveryMode: "Email",
  //         signerType: "Signer",
  //         locale: "EN",
  //       },
  //     ];
  //   }

  //   // 🔥 FORCE OVERRIDE (toggle this)
  //   const FORCE_TEST_EMAIL = true;

  //   if (FORCE_TEST_EMAIL) {
  //     roles = roles.map((r) => ({
  //       ...r,
  //       signerName: "Shruti",
  //       signerEmail: "shruti10@fusiontecz.com",
  //     }));
  //   }

  //   // ✅ Validation
  //   const validRoles = roles.filter((r) => r.signerEmail.trim() !== "");

  //   if (validRoles.length === 0) {
  //     throw new BadRequestException(
  //       "At least one signer with a valid email is required to send to BoldSign.",
  //     );
  //   }

  //   // ── Payload ──
  //   const sendPayload: Record<string, any> = {
  //     title: options.title || "LLC Operating Agreement",
  //     message:
  //       options.message ||
  //       "An LLC operating agreement is a legal document.",
  //     roles: validRoles,
  //   };

  //   if (options.labels?.length) sendPayload.labels = options.labels;

  //   if (options.roleRemovalIndices?.length)
  //     sendPayload.roleRemovalIndices = options.roleRemovalIndices;

  //   if (options.reminderSettings) {
  //     sendPayload.reminderSettings = {
  //       enableAutoReminder:
  //         options.reminderSettings.enableAutoReminder ?? true,
  //       reminderDays: options.reminderSettings.reminderDays ?? 3,
  //       reminderCount: options.reminderSettings.reminderCount ?? 5,
  //     };
  //   }

  //   try {
  //     // 1️⃣ Send template
  //     const sendResponse = await apiClient.post(
  //       `/v1/template/send?templateId=${encodeURIComponent(templateId)}`,
  //       sendPayload,
  //       { headers: { "Content-Type": "application/json" } },
  //     );

  //     const documentId = sendResponse.data?.documentId;

  //     if (!documentId) {
  //       throw new BadRequestException(
  //         "BoldSign did not return documentId",
  //       );
  //     }

  //     // 2️⃣ Prefill
  //     let prefillResponse: any = null;
  //     if (options.prefillFields?.length) {
  //       prefillResponse = await this.prefillFormFields(
  //         userId,
  //         documentId,
  //         options.prefillFields,
  //       );
  //     }

  //     // 3️⃣ CC email (PDF)
  //     let ccPrefilledEmailResult: any = null;
  //     if (options.ccEmails?.length) {
  //       ccPrefilledEmailResult =
  //         await this.emailPrefilledContractPdfToCcRecipients(
  //           documentId,
  //           options.ccEmails,
  //           options.title || "LLC Operating Agreement",
  //           userId,
  //         );
  //     }

  //     // 4️⃣ Embedded URL
  //     const embedPayload: Record<string, any> = {
  //       redirectUrl:
  //         options.redirectUrl ||
  //         "https://boldsign.com/esignature-api/",
  //       showToolbar: options.showToolbar ?? true,
  //       sendViewOption: normalizeBoldSignSendViewOption(
  //         options.sendViewOption,
  //       ),
  //       showSaveButton: options.showSaveButton ?? true,
  //       showSendButton: options.showSendButton ?? true,
  //       showPreviewButton: options.showPreviewButton ?? true,
  //       showNavigationButtons:
  //         options.showNavigationButtons ?? true,
  //     };

  //     if (options.sendLinkValidTill) {
  //       embedPayload.sendLinkValidTill =
  //         options.sendLinkValidTill;
  //     }

  //     const embedResponse = await apiClient.post(
  //       `/v1/document/createEmbeddedRequestUrl?documentId=${documentId}`,
  //       embedPayload,
  //       { headers: { "Content-Type": "application/json" } },
  //     );

  //     return {
  //       success: true,
  //       documentId,
  //       sendUrl: embedResponse.data?.sendUrl,
  //       message:
  //         "Document created, prefilled, and ready for preview.",
  //       data: {
  //         send: sendResponse.data,
  //         prefill: prefillResponse,
  //         ccPrefilledEmail: ccPrefilledEmailResult,
  //         embed: embedResponse.data,
  //       },
  //     };
  //   } catch (error: any) {
  //     if (error?.response?.status === 401) {
  //       throw new UnauthorizedException(
  //         "BoldSign authentication failed.",
  //       );
  //     }

  //     if (error?.response?.status === 400) {
  //       throw new BadRequestException(
  //         `BoldSign validation error: ${JSON.stringify(
  //           error.response.data,
  //         )}`,
  //       );
  //     }

  //     throw new BadRequestException(
  //       "Failed to send template: " +
  //       (error?.message || error),
  //     );
  //   }
  // }

  async addRecipientsToTemplate(
    userId: string,
    params: {
      templateId: string;
      roles: Array<{
        roleName?: string;
        signerName?: string;
        signerEmail?: string;
        locale?: string;
        privateMessage?: string;
        authenticationCode?: string;
        authenticationType?: string;
        deliveryMode?: string;
      }>;
      title?: string;
      message?: string;
      enableSigningOrder?: boolean;
      ccEmails?: string[];
    },
  ) {
    if (!params?.roles || params.roles.length === 0) {
      throw new BadRequestException(
        'roles is required and must be a non-empty array',
      );
    }

    const apiClient = await this.getApiClient(userId);

    // ✅ FIX: Map roles safely, forcing strings
    const mappedRoles = params.roles.map((r, index) => ({
      roleIndex: index + 1,
      signerName: String(r.signerName || ""),
      signerEmail: String(r.signerEmail || ""),
      privateMessage: r.privateMessage || "",
      authenticationCode: r.authenticationCode || "",
      authenticationType: r.authenticationType || "AccessCode",
      deliveryMode: r.deliveryMode || "Email",
      locale: r.locale || "EN",
      signerType: "Signer",
    }));

    // ✅ CRITICAL FIX: Filter out any roles where email is empty BEFORE sending to BoldSign
    const validRoles = mappedRoles.filter((r) => r.signerEmail.trim() !== "");

    if (validRoles.length === 0) {
      throw new BadRequestException(
        "At least one role with a valid email is required.",
      );
    }

    const payload: any = {
      templateId: params.templateId,
      roles: validRoles, // ✅ Send ONLY valid roles
    };

    if (params.enableSigningOrder != null)
      payload.enableSigningOrder = params.enableSigningOrder;

    if (params.title) payload.title = params.title;
    if (params.message) payload.message = params.message;

    const ccListRecipients = boldSignDocumentCCList(params.ccEmails);
    if (ccListRecipients?.length) {
      payload.CC = ccListRecipients;
    }

    try {
      const response = await apiClient.post(
        '/v1/template/send',
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        success: true,
        documentId: response.data?.documentId,
        data: response.data,
      };
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new UnauthorizedException(
          'BoldSign authentication failed. Please reconnect.',
        );
      }

      if (error?.response?.data) {
        throw new BadRequestException(
          `BoldSign error: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw new BadRequestException(
        'Failed to send template with roles: ' +
        (error?.message || error),
      );
    }
  }

  async prefillFormFields(
    userId: string,
    documentId: string,
    fields: Array<{ id: string; value: string }>
  ) {
    try {
      if (!documentId) {
        throw new BadRequestException('documentId is required');
      }

      const apiClient = await this.getApiClient(userId);

      const mappedFields = fields
        .filter((f) => f?.id && String(f.value ?? '').trim() !== '')
        .map((f) => ({
          id: String(f.id).trim(),
          value: toPrefillUppercase(String(f.value ?? '').trim(), String(f.id).trim()),
        }));

      if (mappedFields.length === 0) {
        return null;
      }

      let fieldsToSend = mappedFields;
      try {
        const propsRes = await apiClient.get('/v1/document/properties', {
          params: { documentId },
        });
        const idMap = buildBoldSignPrefillCanonicalIdMap(propsRes.data);
        if (idMap && idMap.size > 0) {
          const before = mappedFields.length;
          const resolveCanonical = (crmId: string): string | undefined => {
            const k = crmId.trim().toLowerCase();
            const variants = [
              k,
              k.replace(/\s+/g, '_'),
              k.replace(/_/g, ' '),
              ...(BOLDSIGN_PREFILL_CRM_ID_ALIASES[k] ?? []),
            ];
            for (const v of variants) {
              const hit = idMap.get(v);
              if (hit) return hit;
            }
            return undefined;
          };
          fieldsToSend = mappedFields
            .map((f) => {
              const canon = resolveCanonical(f.id);
              if (!canon) return null;
              return { id: canon, value: f.value };
            })
            .filter((row): row is { id: string; value: string } => row !== null);
          if (fieldsToSend.length < before) {
            console.warn(
              `[BoldSign] prefill: omitted ${before - fieldsToSend.length} field(s) with no matching BoldSign form field id on document ${documentId}`,
            );
          }
        }
      } catch (filterErr) {
        console.warn(
          '[BoldSign] prefill: could not load document properties to filter field ids; sending all requested fields',
          filterErr,
        );
      }

      if (fieldsToSend.length === 0) {
        return null;
      }

      // BoldSign REST expects PascalCase property names for this endpoint (same as older .NET serializers).
      const payload = {
        Fields: fieldsToSend.map((f) => ({
          Id: f.id,
          Value: f.value,
        })),
      };

      const response = await apiClient.patch(
        `/v1/document/prefillFields?documentId=${documentId}`,
        payload
      );

      return response.data;

    } catch (error: any) {
      console.error("BoldSign Prefill Error:", error?.response?.data || error);
      throw error;
    }
  }

  /** Brief pause so BoldSign can finalize merged PDF values before we snapshot the document for CC email. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Draft / in-progress document PDF (includes prefilled field values when download is allowed for the account). */
  private async downloadDocumentPdfBuffer(userId: string, documentId: string): Promise<Buffer | null> {
    try {
      const apiClient = await this.getApiClient(userId);
      const res = await apiClient.get(`/v1/document/download?documentId=${encodeURIComponent(documentId)}`, {
        responseType: 'arraybuffer',
      });
      if (res.status >= 400) return null;
      const raw = res.data as ArrayBuffer | Buffer | undefined;
      if (!raw) return null;
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      return buf.length > 0 ? buf : null;
    } catch (error: any) {
      console.warn(
        '[BoldSign] downloadDocumentPdfBuffer failed:',
        error?.response?.status,
        error?.response?.data || error?.message || error,
      );
      return null;
    }
  }

  /**
   * BoldSign "CC" is not a signer role — BoldSign does not treat CC as prefilled recipients, so their
   * BoldSign emails often show a blank template. We email each CC address ourselves with the
   * prefilled PDF downloaded from BoldSign after CRM prefill.
   */
  private async emailPrefilledContractPdfToCcRecipients(
    documentId: string,
    ccEmails: string[] | undefined | null,
    subjectBase: string,
    userId: string,
    /** Application UUID — when set, each copy is written to the deal's Mail Log. */
    applicationId?: string,
  ): Promise<{ emailed: string[] }> {
    const list = [...new Set((ccEmails || []).map((e) => String(e ?? '').trim()).filter(Boolean))];
    if (!list.length) return { emailed: [] };

    if (!isOutboundSmtpConfigured()) {
      console.warn(
        '[BoldSign] CC prefilled PDF email skipped: outbound SMTP/SendGrid is not configured (set SENDGRID_API_KEY or SMTP credentials).',
      );
      return { emailed: [] };
    }

    await this.sleep(1500);
    const pdf = await this.downloadDocumentPdfBuffer(userId, documentId);
    if (!pdf?.length) {
      console.warn(
        `[BoldSign] No PDF bytes for document ${documentId}; CC addresses will not receive a CRM prefilled copy by email.`,
      );
      return { emailed: [] };
    }

    const subject = subjectBase.trim() ? `${subjectBase.trim()} ` : 'Contract';
    const html = ``;

    const emailed: string[] = [];
    for (const to of list) {
      try {
        await sendMail({
          to,
          subject,
          html,
          attachments: [
            {
              filename: 'contract-prefilled.pdf',
              content: pdf,
              contentType: 'application/pdf',
            },
          ],
        });
        emailed.push(to);
        await logDealEmail({
          applicationId,
          to,
          subject,
          template: 'contract-cc-copy',
          templateName: 'Contract copy (CC)',
          description: 'Prefilled contract PDF emailed to a CC recipient.',
          sent: true,
        });
      } catch (err) {
        console.error(`[BoldSign] Failed to email prefilled PDF CC to ${to}:`, err);
        await logDealEmail({
          applicationId,
          to,
          subject,
          template: 'contract-cc-copy',
          templateName: 'Contract copy (CC)',
          description: 'Prefilled contract PDF email to a CC recipient failed.',
          sent: false,
          error: err,
        });
      }
    }
    return { emailed };
  }

  /** Get an embedded request URL so the sender can review the document before sending */
  async getEmbeddedRequestUrl(userId: string, documentId: string, redirectUrl: string) {
    const apiClient = await this.getApiClient(userId);
    try {
      const response = await apiClient.post(
        `/v1/document/createEmbeddedRequestUrl?documentId=${encodeURIComponent(documentId)}`,
        { redirectUrl },
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 401) throw new UnauthorizedException('BoldSign auth failed.');
      throw new BadRequestException('Failed to get embedded request URL: ' + (error?.message || error));
    }
  }

  /** Get an embedded signing link for a specific signer */
  async getEmbeddedSignLink(userId: string, documentId: string, signerEmail: string, redirectUrl: string) {
    const apiClient = await this.getApiClient(userId);
    try {
      const response = await apiClient.get('/v1/document/getEmbeddedSignLink', {
        params: { documentId, signerEmail, redirectUrl },
      });
      return response.data;
    } catch (error: any) {
      throw new BadRequestException('Failed to get sign link: ' + (error?.message || error));
    }
  }

  // ──────────── Document management ────────────

  private normalizeBoldSignTemplateLookupKey(value: string | null | undefined): string | undefined {
    const t = String(value ?? '').trim().toLowerCase();
    return t || undefined;
  }

  /**
   * Resolve BoldSign template UUIDs from `BoldSignTemplate` (state / frequency / type).
   * DB values are stored lowercase (e.g. state `kansas`, frequency `daily`).
   */
  private async resolveBoldSignTemplateIdsFromDb(filters: {
    state?: string | null;
    frequency?: string | null;
    type?: string | null;
  }): Promise<string[]> {
    const state = this.normalizeBoldSignTemplateLookupKey(filters.state);
    const frequency = this.normalizeBoldSignTemplateLookupKey(filters.frequency);
    const type =
      filters.type != null && String(filters.type).trim() !== ''
        ? String(filters.type).trim().toLowerCase()
        : undefined;

    const where: Prisma.BoldSignTemplateWhereInput = {};
    if (state) where.state = state;
    if (frequency) where.frequency = frequency;
    if (type) where.type = type;

    if (Object.keys(where).length === 0) {
      return [];
    }

    const rows = await prisma.boldSignTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const ids = rows
      .map((r) => String(r.templateId || '').trim())
      .filter(Boolean);

    return [...new Set(ids)];
  }

  /**
   * v1-beta merge uses the same PascalCase JSON shape as other BoldSign .NET endpoints.
   * camelCase (`signerName`) is ignored → "SignerName or SignerEmail is missing in roles".
   */
  private normalizeFormFieldBoundsForBoldSignV1Beta(
    b: Record<string, any>,
  ): Record<string, unknown> {
    return {
      X: b.X ?? b.x,
      Y: b.Y ?? b.y,
      Width: b.Width ?? b.width,
      Height: b.Height ?? b.height,
    };
  }

  private normalizeFormFieldForBoldSignV1Beta(f: Record<string, any>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    const id = f.Id ?? f.id;
    const name = f.Name ?? f.name;
    const fieldType = f.FieldType ?? f.fieldType;
    const pageNumber = f.PageNumber ?? f.pageNumber;
    const bounds = f.Bounds ?? f.bounds;
    if (id != null && String(id) !== '') out.Id = id;
    if (name != null && String(name) !== '') out.Name = name;
    if (fieldType != null && String(fieldType) !== '') out.FieldType = fieldType;
    if (pageNumber != null && String(pageNumber).trim() !== '') {
      const pn = Number(pageNumber);
      if (Number.isFinite(pn)) out.PageNumber = pn;
    }
    if (bounds != null && typeof bounds === 'object') {
      out.Bounds = this.normalizeFormFieldBoundsForBoldSignV1Beta(bounds as Record<string, any>);
    }
    const fieldValue = f.Value ?? f.value;
    if (fieldValue != null && String(fieldValue).trim() !== '') {
      out.Value = String(fieldValue).trim();
    }
    const fieldRoleRaw = f.RoleIndex ?? f.roleIndex;
    const fieldRole = Number(fieldRoleRaw);
    if (Number.isFinite(fieldRole) && fieldRole > 0) {
      out.RoleIndex = fieldRole;
    }
    return out;
  }

  private normalizeRoleForBoldSignV1BetaMerge(r: Record<string, any>): Record<string, unknown> {
    const signerName = String(r.SignerName ?? r.signerName ?? '').trim();
    const signerEmail = String(r.SignerEmail ?? r.signerEmail ?? '').trim();
    const roleIndexRaw = r.RoleIndex ?? r.roleIndex ?? 1;
    const roleIndex = Number(roleIndexRaw);
    const orderRaw = r.SignerOrder ?? r.signerOrder ?? roleIndexRaw;
    const signerOrder = Number(orderRaw);

    const signerTypeRaw = String(r.SignerType ?? r.signerType ?? 'Signer').trim();
    const signerType = /^signer$/i.test(signerTypeRaw) ? 'Signer' : signerTypeRaw || 'Signer';

    const out: Record<string, unknown> = {
      RoleIndex: Number.isFinite(roleIndex) ? roleIndex : 1,
      SignerName: signerName,
      SignerEmail: signerEmail,
      SignerOrder: Number.isFinite(signerOrder) ? signerOrder : 1,
      SignerType: signerType,
      Locale: String(r.Locale ?? r.locale ?? 'EN'),
      DeliveryMode: String(r.DeliveryMode ?? r.deliveryMode ?? 'Email'),
    };

    const pm = r.PrivateMessage ?? r.privateMessage;
    if (pm != null && String(pm).trim() !== '') out.PrivateMessage = String(pm);

    const ac = r.AuthenticationCode ?? r.authenticationCode;
    if (ac != null && String(ac) !== '') out.AuthenticationCode = String(ac);
    const at = r.AuthenticationType ?? r.authenticationType;
    if (at != null && String(at) !== '') out.AuthenticationType = String(at);

    const sr = r.SignerRole ?? r.signerRole;
    if (sr != null && String(sr).trim() !== '') out.SignerRole = String(sr);

    const ff = r.FormFields ?? r.formFields;
    if (Array.isArray(ff) && ff.length > 0) {
      out.FormFields = ff.map((item) =>
        this.normalizeFormFieldForBoldSignV1Beta(item as Record<string, any>),
      );
    }

    return out;
  }

  /** Persist `Document` so webhooks can tie BoldSign `documentId` to an application. */
  private async linkBoldSignDocumentToApplication(
    authUserUuid: string,
    applicationUuid: string,
    boldSignDocumentId: string,
  ): Promise<void> {
    const appId = String(applicationUuid || '').trim();
    const docId = String(boldSignDocumentId || '').trim();
    if (!appId || !docId) return;
    try {
      const existingDoc = await prisma.document.findUnique({
        where: { applicationId: appId },
        select: { userId: true },
      });
      const documentOwnerUserId = await resolveDocumentOwnerNumericUserId(
        authUserUuid,
        appId,
        existingDoc?.userId,
      );
      if (documentOwnerUserId == null) return;
      await prisma.document.upsert({
        where: { applicationId: appId },
        create: {
          applicationId: appId,
          envelopeId: docId,
          status: 'draft',
          userId: documentOwnerUserId,
        },
        update: {
          envelopeId: docId,
          status: 'draft',
          sentAt: null,
          completedAt: null,
        },
      });
    } catch (e) {
      console.error('BoldSign: failed to link document to application', e);
    }
  }

  /**
   * BoldSign merge requires signer rows for every merged template. Callers pass the role list for the
   * primary (first) template only; this repeats it across `templateCount` templates with global
   * `roleIndex` 1 … templateCount * roles.length.
   */
  private replicateRolesForMergedTemplates(
    templateCount: number,
    roles: Array<Record<string, any>>,
    secondaryMergeRoleFormFields?: Array<Record<string, any>> | null,
  ): Array<Record<string, any>> {
    if (templateCount <= 1 || !roles?.length) return roles;
    const perTemplate = roles.length;
    const out: Array<Record<string, any>> = [];
    for (let ti = 0; ti < templateCount; ti++) {
      for (let ri = 0; ri < perTemplate; ri++) {
        const src = roles[ri];
        const globalIdx = ti * perTemplate + ri + 1;
        /** BoldSign rejects duplicate signers when the same email repeats with the same order; keep email but use a distinct order per merged role. */
        const signerOrderForMerge = globalIdx;
        const inheritedFfRaw = src.formFields ?? src.FormFields;
        const inheritedFf: Array<Record<string, any>> = Array.isArray(inheritedFfRaw)
          ? (inheritedFfRaw as Array<Record<string, any>>).filter(
            (x) => x && typeof x === 'object' && Object.keys(x as object).length > 0,
          )
          : [];
        const hasInherited = inheritedFf.length > 0;

        /**
         * When the caller consolidated formFields for all templates onto a single signer row,
         * each field carries its own `roleIndex` pointing at the template slot it belongs to.
         * Scope to just this slot here so BoldSign does not see the same id (e.g. `sign`, `sign1`)
         * repeated across multiple roles, which it rejects as a duplicate field id.
         *
         * If no inherited field has an explicit `roleIndex`, treat them as primary-only (ti === 0).
         */
        let scopedInheritedFf: Array<Record<string, any>> | undefined;
        if (hasInherited) {
          const anyHasRoleIndex = inheritedFf.some((f) =>
            Number.isFinite(Number(f?.roleIndex ?? f?.RoleIndex)),
          );
          if (anyHasRoleIndex) {
            const matched = inheritedFf.filter(
              (f) => Number(f?.roleIndex ?? f?.RoleIndex) === globalIdx,
            );
            if (matched.length > 0) {
              scopedInheritedFf = matched.map((f) => {
                const { roleIndex: _ri, RoleIndex: _RI, ...rest } = f as Record<string, any>;
                return { ...rest, roleIndex: globalIdx, RoleIndex: globalIdx };
              });
            }
          } else if (ti === 0) {
            scopedInheritedFf = inheritedFf.map((f) => ({
              ...f,
              roleIndex: globalIdx,
              RoleIndex: globalIdx,
            }));
          }
        }

        const fallbackFfRaw =
          ti >= 1 && secondaryMergeRoleFormFields?.length ? secondaryMergeRoleFormFields : undefined;
        const fallbackFf = fallbackFfRaw?.length
          ? fallbackFfRaw.map((field) => ({
            ...field,
            roleIndex: globalIdx,
            RoleIndex: globalIdx,
          }))
          : undefined;

        const formFields =
          scopedInheritedFf && scopedInheritedFf.length > 0
            ? scopedInheritedFf
            : ti >= 1 && fallbackFf?.length
              ? fallbackFf
              : undefined;

        const { formFields: _dropFf, FormFields: _dropFF, ...srcRest } = src;
        const row: Record<string, any> = {
          ...srcRest,
          roleIndex: globalIdx,
          RoleIndex: globalIdx,
          signerOrder: signerOrderForMerge,
          SignerOrder: signerOrderForMerge,
        };
        if (Array.isArray(formFields) && formFields.length > 0) {
          row.formFields = formFields;
        }
        out.push(row);
      }
    }
    return out;
  }

  /**
   * If the client already sent one signer row per template (`roles.length === templateCount` with
   * `roleIndex` 1…N), use that payload as-is. Otherwise expand from the first template’s roles.
   */
  private resolveMergeRolesForTemplates(
    templateIds: string[],
    roles: Array<Record<string, any>>,
    secondaryMergeRoleFormFields?: Array<Record<string, any>> | null,
  ): Array<Record<string, any>> {
    const t = templateIds.length;
    if (t <= 1) return roles;
    const preExpanded =
      roles.length === t &&
      roles.every((r, i) => Number(r.roleIndex ?? r.RoleIndex ?? 0) === i + 1);
    if (preExpanded) return roles;
    return this.replicateRolesForMergedTemplates(t, roles, secondaryMergeRoleFormFields);
  }

  // ──────────── Merge multiple templates → Send → (optional Prefill) → Embedded URL ────────────
  /**
   * Default: **BoldSign v1-beta** `POST /v1-beta/template/mergeAndSend` with `{ templateIds, roles }`.
   * Template IDs may be passed explicitly, or resolved from `BoldSignTemplate` via `contractTemplateFilters`.
   *
   * Legacy: set `useLegacyMergeApi: true` → `POST /v1/template/mergeAndSend` with `{ templates, roles }`.
   */
  async mergeAndSendTemplates(
    userId: string,
    options: {
      /** Legacy v1 shape */
      templates?: Array<{ templateId: string }>;
      /** v1-beta: BoldSign template GUID list */
      templateIds?: string[];
      /** Resolve `templateIds` from DB rows (AND on provided keys; values normalized to lowercase). */
      contractTemplateFilters?: {
        state?: string | null;
        frequency?: string | null;
        type?: string | null;
      };
      /** Role payloads; v1-beta may include `formFields`, `signerOrder`, `signerType`, etc. */
      roles: Array<Record<string, any>>;
      /**
       * When merging, templates after the first may require non-empty `FormFields` on that signer row.
       * If a replicated role has no `formFields`, these are attached for template index >= 1 (e.g. state disclosure).
       */
      secondaryMergeRoleFormFields?: Array<Record<string, any>> | null;
      prefillFields?: Array<{ id: string; value: string }>;
      redirectUrl?: string;
      showToolbar?: boolean;
      sendViewOption?: string;
      showSaveButton?: boolean;
      showSendButton?: boolean;
      showPreviewButton?: boolean;
      showNavigationButtons?: boolean;
      sendLinkValidTill?: string;
      applicationId?: string;
      useLegacyMergeApi?: boolean;
      ccEmails?: string[];
    },
  ) {
    if (!options?.roles?.length) {
      throw new BadRequestException('At least one role is required');
    }

    let templateIds: string[] = [];
    if (options.templateIds?.length) {
      templateIds = options.templateIds.map((id) => String(id).trim()).filter(Boolean);
    } else if (options.contractTemplateFilters) {
      templateIds = await this.resolveBoldSignTemplateIdsFromDb(options.contractTemplateFilters);
    } else if (options.templates?.length) {
      templateIds = options.templates.map((t) => String(t.templateId).trim()).filter(Boolean);
    }

    if (!templateIds.length) {
      throw new BadRequestException(
        'No BoldSign template IDs to merge. Provide templateIds, templates, or contractTemplateFilters that match BoldSignTemplate rows.',
      );
    }

    const mergeRoles =
      templateIds.length > 1
        ? this.resolveMergeRolesForTemplates(
          templateIds,
          options.roles,
          options.secondaryMergeRoleFormFields,
        )
        : options.roles;

    const apiClient = await this.getApiClient(userId);
    const useLegacy = Boolean(options.useLegacyMergeApi);
    const appId = String(options.applicationId || '').trim();

    try {
      let mergeRes: { data?: { documentId?: string } };

      if (useLegacy) {
        const mergePayload: Record<string, unknown> = {
          templates: templateIds.map((templateId) => ({ templateId })),
          roles: mergeRoles.map((r) => ({
            roleIndex: r.roleIndex,
            signerName: String(r.signerName ?? ''),
            signerEmail: String(r.signerEmail ?? ''),
          })),
        };
        // CC added after prefill via document/edit so CC copies include merged + prefilled content.
        console.log('[BoldSign] mergeAndSend (v1) request payload:', JSON.stringify(mergePayload, null, 2));
        mergeRes = await apiClient.post(`/v1/template/mergeAndSend`, mergePayload, {
          headers: { 'Content-Type': 'application/json' },
        });
        console.log('[BoldSign] mergeAndSend (v1) response:', JSON.stringify(mergeRes.data, null, 2));
      } else {
        const rolesPayload = mergeRoles.map((r) =>
          this.normalizeRoleForBoldSignV1BetaMerge(r as Record<string, any>),
        );
        for (let i = 0; i < rolesPayload.length; i++) {
          const row = rolesPayload[i];
          const sn = String(row.SignerName ?? '').trim();
          const se = String(row.SignerEmail ?? '').trim();
          if (!sn || !se) {
            throw new BadRequestException(
              `BoldSign merge role ${i + 1} is missing SignerName or SignerEmail after normalization (got name="${sn}", email="${se}").`,
            );
          }
        }

        /**
         * When the same email signs more than one merged template, BoldSign rejects the request
         * with "Duplicate signers are not allowed" unless `EnableSigningOrder: true` is set.
         * Detect that case and enable signing order automatically.
         * https://developers.boldsign.com/documents/send-document-using-multiple-templates
         */
        const signerEmails = rolesPayload
          .map((row) => String(row.SignerEmail ?? '').trim().toLowerCase())
          .filter(Boolean);
        const hasDuplicateSignerEmails =
          new Set(signerEmails).size !== signerEmails.length;

        const mergePayload: Record<string, unknown> = {
          templateIds,
          roles: rolesPayload,
        };
        if (hasDuplicateSignerEmails) {
          mergePayload.EnableSigningOrder = true;
          /** Order roles by SignerOrder when signing order is enforced. */
          rolesPayload.sort(
            (a, b) =>
              Number((a.SignerOrder as number) ?? 1) -
              Number((b.SignerOrder as number) ?? 1),
          );
        }

        // BoldSign v1-beta expects MetaData as a JSON object (Dictionary<string,string>), not an array of {Name,Value}.
        if (appId) {
          mergePayload.MetaData = { crmApplicationId: appId };
        }
        console.log('[BoldSign] mergeAndSend (v1-beta) request payload:', JSON.stringify(mergePayload, null, 2));
        mergeRes = await apiClient.post(`/v1-beta/template/mergeAndSend`, mergePayload, {
          headers: { 'Content-Type': 'application/json' },
        });
        console.log('[BoldSign] mergeAndSend (v1-beta) response:', JSON.stringify(mergeRes.data, null, 2));
      }

      const documentId = mergeRes.data?.documentId;
      if (!documentId) throw new BadRequestException('BoldSign did not return documentId from mergeAndSend');

      if (appId) {
        await this.linkBoldSignDocumentToApplication(userId, appId, String(documentId));
      }

      // Optional prefill
      let prefillRes: any = null;
      if (options.prefillFields?.length) {
        prefillRes = await this.prefillFormFields(userId, documentId, options.prefillFields);
      }

      let ccPrefilledEmailMergeResult: { emailed: string[] } | null = null;
      if (options.ccEmails?.length) {
        ccPrefilledEmailMergeResult = await this.emailPrefilledContractPdfToCcRecipients(
          String(documentId),
          options.ccEmails,
          'Contract',
          userId,
          appId,
        );
      }

      const embedPayload: Record<string, any> = {
        redirectUrl: options.redirectUrl || 'https://boldsign.com/esignature-api/',
        showToolbar: options.showToolbar ?? true,
        sendViewOption: normalizeBoldSignSendViewOption(options.sendViewOption ?? null),
        showSaveButton: options.showSaveButton ?? true,
        showSendButton: options.showSendButton ?? true,
        showPreviewButton: options.showPreviewButton ?? true,
        showNavigationButtons: options.showNavigationButtons ?? true,
      };
      if (options.sendLinkValidTill) embedPayload.sendLinkValidTill = options.sendLinkValidTill;

      const embedRes = await apiClient.post(
        `/v1/document/createEmbeddedRequestUrl?documentId=${encodeURIComponent(documentId)}`,
        embedPayload,
        { headers: { 'Content-Type': 'application/json' } },
      );

      return {
        success: true,
        documentId,
        sendUrl: embedRes.data?.sendUrl,
        message: useLegacy
          ? 'Templates merged (v1); optional prefill complete; embedded URL created'
          : 'Templates merged (v1-beta); optional prefill complete; embedded URL created',
        data: {
          templateIds,
          merge: mergeRes.data,
          prefill: prefillRes,
          ccPrefilledEmail: ccPrefilledEmailMergeResult,
          embed: embedRes.data,
        },
      };
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new UnauthorizedException('BoldSign authentication failed. Please reconnect.');
      }
      if (error?.response?.data) {
        throw new BadRequestException(`BoldSign error: ${JSON.stringify(error.response.data)}`);
      }
      throw new BadRequestException('Failed to merge and send templates: ' + (error?.message || error));
    }
  }

  /** Void / revoke a document */
  async voidDocument(userId: string, documentId: string, reason: string) {
    const apiClient = await this.getApiClient(userId);
    try {
      await apiClient.patch(`/v1/document/void?documentId=${documentId}`, { message: reason });
      const docRow = await (prisma as any).document.findFirst({
        where: { envelopeId: documentId },
        select: { applicationId: true },
      });
      await (prisma as any).document.updateMany({
        where: { envelopeId: documentId },
        data: { status: 'voided' },
      });
      if (docRow?.applicationId) {
        const { syncApplicationWorkflowFromContractEnvelopeStatus } = await import(
          '../contractApplicationWorkflowSync'
        );
        await syncApplicationWorkflowFromContractEnvelopeStatus(
          prisma,
          String(docRow.applicationId),
          'revoked',
          { source: 'boldsign.voidDocument' },
        );
      }
      return { success: true };
    } catch (error: any) {
      throw new BadRequestException('Failed to void document: ' + (error?.message || error));
    }
  }

  /** Get document status / properties from BoldSign */
  async getDocumentProperties(userId: string, documentId: string) {
    const apiClient = await this.getApiClient(userId);
    const response = await apiClient.get('/v1/document/properties', {
      params: { documentId },
    });
    return response.data;
  }

  /** Download the completed/signed PDF */
  async downloadSignedPdf(userId: string, documentId: string): Promise<Buffer> {
    const apiClient = await this.getApiClient(userId);
    const response = await apiClient.get('/v1/document/download', {
      params: { documentId },
      responseType: 'arraybuffer',
    });
    return Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
  }

  /**
   * Download a BoldSign template PDF (the original/source PDF behind a template).
   * Uses BoldSign's `/v1/template/download?templateId=...` endpoint.
   * Used by the CRM "preview template" UI so users can inspect a mapped template
   * without having to send/merge it first.
   */
  async downloadTemplatePdf(userId: string, templateId: string): Promise<Buffer> {
    const tid = String(templateId ?? '').trim();
    if (!tid) {
      throw new BadRequestException('templateId is required');
    }
    const apiClient = await this.getApiClient(userId);
    try {
      const response = await apiClient.get('/v1/template/download', {
        params: { templateId: tid },
        responseType: 'arraybuffer',
      });
      return Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(response.data);
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const hint =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString('utf8').slice(0, 500)
            : data && typeof data === 'object'
              ? JSON.stringify(data)
              : error?.message || String(error);
      throw new BadRequestException(
        `Could not download template PDF from BoldSign${status ? ` (${status})` : ''}: ${hint}`,
      );
    }
  }

  /** BoldSign `documentId` stored on CRM `Document.envelopeId` (per application UUID). */
  async getBoldSignDocumentIdForApplication(applicationUuid: string): Promise<string | null> {
    const trimmed = String(applicationUuid ?? '').trim();
    if (!trimmed) return null;
    const row = await prisma.document.findUnique({
      where: { applicationId: trimmed },
      select: { envelopeId: true },
    });
    const id = row?.envelopeId ? String(row.envelopeId).trim() : '';
    return id || null;
  }

  /**
   * PDF snapshot from BoldSign for the document linked to an application (draft / prefilled or completed).
   * Same BoldSign API as {@link downloadSignedPdf}; requires a `Document` row (created on send-template / merge).
   */
  async downloadDocumentPdfForApplication(userId: string, applicationUuid: string): Promise<Buffer> {
    const documentId = await this.getBoldSignDocumentIdForApplication(applicationUuid);
    if (!documentId) {
      throw new BadRequestException(
        'No BoldSign document is linked to this application yet. Generate the contract or send to BoldSign first.',
      );
    }
    try {
      return await this.downloadSignedPdf(userId, documentId);
    } catch (error: any) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const hint =
        typeof data === 'string'
          ? data
          : data && typeof data === 'object'
            ? JSON.stringify(data)
            : error?.message || String(error);
      throw new BadRequestException(
        `Could not download prefilled PDF from BoldSign${status ? ` (${status})` : ''}: ${hint}`,
      );
    }
  }

  /** List documents with optional pagination */
  async listDocuments(userId: string, page = 1, pageSize = 10) {
    const apiClient = await this.getApiClient(userId);
    const response = await apiClient.get('/v1/document/list', {
      params: { Page: page, PageSize: pageSize },
    });
    return response.data;
  }

  /** Get recipients/roles configured on a template */
  async getTemplateRecipients(userId: string) {
    const templateId = '50deb96f-c5da-44b7-9a97-90397deaa29c';
    if (!templateId) {
      throw new BadRequestException('templateId is required');
    }
    const apiClient = await this.getApiClient(userId);
    try {
      // Use properties endpoint with query param (avoids 404 on details)
      const response = await apiClient.get(
        `/v1/template/properties?templateId=${templateId}`
      );
      const data = response.data || {};
      const roles = data.roles || data.templateRoles || [];
      const normalized = roles.map((r: any, idx: number) => ({
        roleName: r.roleName || r.name || `Role-${idx + 1}`,
        signerName: r.signerName || r.defaultRecipientName || '',
        signerEmail: r.signerEmail || r.defaultRecipientEmail || '',
        signerOrder: r.signerOrder ?? r.order ?? null,
        locale: r.locale || 'EN',
      }));
      return {
        success: true,
        templateId,
        roles: normalized,
        raw: data,
      };
    } catch (error: any) {
      if (error?.response?.status === 401) {
        throw new UnauthorizedException('BoldSign authentication failed. Please reconnect.');
      }
      const status = error?.response?.status;
      const payload = error?.response?.data;
      throw new BadRequestException(
        `Failed to fetch template recipients (status ${status || 'unknown'}): ${JSON.stringify(payload)}`,
      );
    }
  }

  // ──────────── Webhook processing ────────────

  async processWebhookEvent(body: any) {
    const payload = parseWebhookPayload(body);
    const payloadData = payload?.data ?? body?.data ?? body?.document ?? null;
    const documentId =
      payloadData?.documentId ??
      payloadData?.documentID ??
      body?.document?.documentId;
    if (!documentId) return;

    const incomingResolved = resolveBoldSignWebhookEnvelopeStatus(body);
    if (!incomingResolved) return;

    const existingDoc = await prisma.document.findFirst({
      where: { envelopeId: String(documentId) },
    });

    const status = mergeWithExistingEnvelopeStatus(
      existingDoc?.status,
      incomingResolved,
    );
    if (!status) return;

    const updateData: Record<string, unknown> = { status };

    if (status === "sent") {
      updateData.sentAt = existingDoc?.sentAt ?? new Date();
    } else if (status === "completed") {
      updateData.completedAt = new Date();
    }

    const docUpdate = await prisma.document.updateMany({
      where: { envelopeId: String(documentId) },
      data: updateData as any,
    });

    const applicationIdFromPayload =
      payloadData?.applicationId ??
      payloadData?.applicationID ??
      body?.applicationId;

    let applicationId = applicationIdFromPayload ? String(applicationIdFromPayload) : null;

    // Fallback to the linked Document row when applicationId is not present in webhook payload.
    if (!applicationId) {
      if (docUpdate.count === 0) return;
      const docRow = await prisma.document.findFirst({
        where: { envelopeId: String(documentId) },
        select: { applicationId: true },
      });
      applicationId = docRow?.applicationId ?? null;
    }
    if (!applicationId) return;

    const contractStatus = internalEnvelopeStatusToContractStatusDbValue(status);
    if (!contractStatus) return;

    await prisma.contract.updateMany({
      where: { applicationId },
      data: { status: contractStatus as any },
    });

    const { syncApplicationWorkflowFromContractEnvelopeStatus } = await import(
      '../contractApplicationWorkflowSync'
    );
    await syncApplicationWorkflowFromContractEnvelopeStatus(
      prisma,
      applicationId,
      status,
      { source: 'boldsign.webhook' },
    );
  }
}
