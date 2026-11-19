import jwt from 'jsonwebtoken';
import axios from 'axios';
import type { DocuSignJwtTokenResponse, DocuSignUserInfoResponse } from '../../../types/oauth-api';
import {
  DOCUSIGN_AUTH_BASE,
  DOCUSIGN_CLIENT_ID,
  DOCUSIGN_INTEGRATION_KEY,
  DOCUSIGN_RSA_PRIVATE_KEY,
  DOCUSIGN_IMPERSONATED_USER_ID,
  DOCUSIGN_ACCOUNT_ID,
  DOCUSIGN_BASE_URI,
  getDocusignOAuthUrls,
  isDocusignAccountIdGuid,
  normalizeDocusignRestBaseUri,
} from './docusign-client';

const JWT_LIFETIME_SEC = 3600;
const JWT_SCOPES = 'signature impersonation';

type CachedJwtSession = {
  accessToken: string;
  accountId: string;
  baseUri: string;
  expiresAtMs: number;
};

let cachedSession: CachedJwtSession | null = null;

/** True when server-side JWT impersonation is configured (BoldSign-style; no per-user OAuth). */
export function isDocusignJwtConfigured(): boolean {
  const integrationKey = DOCUSIGN_INTEGRATION_KEY || DOCUSIGN_CLIENT_ID;
  return Boolean(
    integrationKey?.trim() &&
      DOCUSIGN_IMPERSONATED_USER_ID?.trim() &&
      DOCUSIGN_RSA_PRIVATE_KEY?.trim(),
  );
}

function normalizePemKey(raw: string): string {
  return raw.replace(/\\n/g, '\n').trim();
}

function getJwtAudience(): string {
  try {
    const host = new URL(DOCUSIGN_AUTH_BASE).host;
    return host;
  } catch {
    return DOCUSIGN_AUTH_BASE.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

function buildJwtAssertion(): string {
  const integrationKey = DOCUSIGN_INTEGRATION_KEY || DOCUSIGN_CLIENT_ID;
  const userId = DOCUSIGN_IMPERSONATED_USER_ID;
  const privateKey = normalizePemKey(DOCUSIGN_RSA_PRIVATE_KEY);

  if (!integrationKey || !userId || !privateKey) {
    throw new Error(
      'DocuSign JWT is not configured. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_IMPERSONATED_USER_ID, and DOCUSIGN_RSA_PRIVATE_KEY.',
    );
  }

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: integrationKey,
      sub: userId,
      aud: getJwtAudience(),
      iat: now,
      exp: now + JWT_LIFETIME_SEC,
      scope: JWT_SCOPES,
    },
    privateKey,
    { algorithm: 'RS256' },
  );
}

async function fetchAccessToken(assertion: string): Promise<string> {
  const { tokenUrl } = getDocusignOAuthUrls();
  const params = new URLSearchParams();
  params.append('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  params.append('assertion', assertion);

  const res = await axios.post<DocuSignJwtTokenResponse>(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const accessToken = res.data?.access_token;
  if (!accessToken) {
    throw new Error('DocuSign JWT token response missing access_token');
  }
  return accessToken;
}

async function resolveAccountFromUserInfo(accessToken: string): Promise<{
  accountId: string;
  baseUri: string;
}> {
  const { userInfoUrl } = getDocusignOAuthUrls();
  const userInfoRes = await axios.get<DocuSignUserInfoResponse>(userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const accounts = userInfoRes.data?.accounts || [];
  const defaultAccount =
    accounts.find((a: { is_default?: boolean }) => a.is_default) || accounts[0];

  if (!defaultAccount?.account_id || !defaultAccount?.base_uri) {
    throw new Error(
      'Could not resolve DocuSign account from userinfo. Check JWT consent and impersonated user.',
    );
  }

  let accountId = String(defaultAccount.account_id);
  const envAccountId = DOCUSIGN_ACCOUNT_ID?.trim();
  if (envAccountId) {
    if (isDocusignAccountIdGuid(envAccountId)) {
      const match = accounts.find(
        (a: { account_id?: string }) => String(a.account_id) === envAccountId,
      );
      if (match) {
        accountId = envAccountId;
      } else {
        console.warn(
          `[DocuSign] DOCUSIGN_ACCOUNT_ID=${envAccountId} not found in userinfo accounts; using default ${accountId}`,
        );
      }
    } else {
      console.warn(
        `[DocuSign] DOCUSIGN_ACCOUNT_ID=${envAccountId} is numeric — ignoring. Use API account GUID from DocuSign Admin.`,
      );
    }
  }

  let baseUri = normalizeDocusignRestBaseUri(String(defaultAccount.base_uri));
  const envBaseUri = DOCUSIGN_BASE_URI?.trim();
  if (envBaseUri) {
    const normalizedEnv = normalizeDocusignRestBaseUri(envBaseUri);
    if (normalizedEnv !== baseUri) {
      console.warn(
        `[DocuSign] DOCUSIGN_BASE_URI (${normalizedEnv}) differs from userinfo (${baseUri}); using userinfo.`,
      );
    }
  }

  console.log(
    `[DocuSign] JWT session resolved accountId=${accountId} apiBase=${baseUri}`,
  );

  return { accountId, baseUri };
}

/**
 * Server-to-server DocuSign session (JWT grant). Cached ~50 minutes.
 * Same idea as BoldSign API-key auth — CRM users do not need to connect DocuSign.
 */
export async function getDocusignJwtSession(): Promise<{
  accessToken: string;
  accountId: string;
  baseUri: string;
}> {
  const bufferMs = 5 * 60 * 1000;
  if (
    cachedSession &&
    cachedSession.expiresAtMs - bufferMs > Date.now() &&
    isDocusignAccountIdGuid(cachedSession.accountId)
  ) {
    return {
      accessToken: cachedSession.accessToken,
      accountId: cachedSession.accountId,
      baseUri: cachedSession.baseUri,
    };
  }

  if (cachedSession && !isDocusignAccountIdGuid(cachedSession.accountId)) {
    console.warn(
      `[DocuSign] JWT cache had non-GUID accountId=${cachedSession.accountId}; refreshing session`,
    );
    cachedSession = null;
  }

  const assertion = buildJwtAssertion();
  const accessToken = await fetchAccessToken(assertion);
  const { accountId, baseUri } = await resolveAccountFromUserInfo(accessToken);

  cachedSession = {
    accessToken,
    accountId,
    baseUri,
    expiresAtMs: Date.now() + (JWT_LIFETIME_SEC - 60) * 1000,
  };

  return { accessToken, accountId, baseUri };
}

/** Clear cached JWT (e.g. after consent or key rotation). */
export function clearDocusignJwtCache(): void {
  cachedSession = null;
}
