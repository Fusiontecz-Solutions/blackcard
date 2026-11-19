import jwt from 'jsonwebtoken';
import axios from 'axios';
import {
  DOCUSIGN_AUTH_BASE,
  getDocusignOAuthUrls,
  isDocusignAccountIdGuid,
  normalizeDocusignRestBaseUri,
} from './docusign-client';
import { normalizePemKey } from './normalize-pem-key';

const JWT_LIFETIME_SEC = 3600;
const JWT_SCOPES = 'signature impersonation';

export type DocuSignProfileCredentials = {
  integrationKey: string;
  impersonatedUserId: string;
  rsaPrivateKey: string;
  accountId?: string | null;
  baseUri?: string | null;
};

type CachedJwtSession = {
  accessToken: string;
  accountId: string;
  baseUri: string;
  expiresAtMs: number;
};

const profileSessionCache = new Map<string, CachedJwtSession>();

function getJwtAudience(): string {
  try {
    return new URL(DOCUSIGN_AUTH_BASE).host;
  } catch {
    return DOCUSIGN_AUTH_BASE.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }
}

function buildJwtAssertion(creds: DocuSignProfileCredentials): string {
  const integrationKey = String(creds.integrationKey || '').trim();
  const userId = String(creds.impersonatedUserId || '').trim();
  const privateKey = normalizePemKey(String(creds.rsaPrivateKey || ''));

  if (!integrationKey || !userId || !privateKey) {
    throw new Error('DocuSign profile is missing integration key, impersonated user, or RSA key.');
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

  const res = await axios.post(tokenUrl, params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const accessToken = res.data?.access_token;
  if (!accessToken) {
    throw new Error('DocuSign token response missing access_token');
  }
  return accessToken;
}

async function resolveAccountFromUserInfo(
  accessToken: string,
  preferredAccountId?: string | null,
  preferredBaseUri?: string | null,
): Promise<{ accountId: string; baseUri: string }> {
  const { userInfoUrl } = getDocusignOAuthUrls();
  const userInfoRes = await axios.get(userInfoUrl, {
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

  const envAccountId = String(preferredAccountId || '').trim();
  let selected = defaultAccount as { account_id?: string; base_uri?: string };

  if (envAccountId && isDocusignAccountIdGuid(envAccountId)) {
    const match = accounts.find(
      (a: { account_id?: string }) => String(a.account_id) === envAccountId,
    );
    if (match) selected = match;
  }

  const accountId = String(selected.account_id);
  const userInfoBaseUri = normalizeDocusignRestBaseUri(String(selected.base_uri));
  const profileBaseUri = String(preferredBaseUri || '').trim();

  if (profileBaseUri) {
    const normalizedProfileBaseUri = normalizeDocusignRestBaseUri(profileBaseUri);
    if (normalizedProfileBaseUri !== userInfoBaseUri) {
      console.warn(
        `[DocuSign] profile baseUri "${profileBaseUri}" differs from userinfo ` +
          `"${selected.base_uri}"; using profile baseUri.`,
      );
    }
    return { accountId, baseUri: normalizedProfileBaseUri };
  }

  return { accountId, baseUri: userInfoBaseUri };
}

export async function getDocusignJwtSessionForProfile(
  profileId: string,
  creds: DocuSignProfileCredentials,
): Promise<{ accessToken: string; accountId: string; baseUri: string }> {
  const bufferMs = 5 * 60 * 1000;
  const cached = profileSessionCache.get(profileId);
  const cachedBaseOk =
    cached &&
    isDocusignAccountIdGuid(cached.accountId) &&
    /\/restapi$/i.test(cached.baseUri.replace(/\/+$/, ''));

  if (cached && cached.expiresAtMs - bufferMs > Date.now() && cachedBaseOk) {
    return {
      accessToken: cached.accessToken,
      accountId: cached.accountId,
      baseUri: cached.baseUri,
    };
  }

  const assertion = buildJwtAssertion(creds);
  const accessToken = await fetchAccessToken(assertion);
  const { accountId, baseUri } = await resolveAccountFromUserInfo(
    accessToken,
    creds.accountId,
    creds.baseUri,
  );

  profileSessionCache.set(profileId, {
    accessToken,
    accountId,
    baseUri,
    expiresAtMs: Date.now() + (JWT_LIFETIME_SEC - 60) * 1000,
  });

  console.log(
    `[DocuSign] JWT session for profile ${profileId}: accountId=${accountId} apiBase=${baseUri}`,
  );

  return { accessToken, accountId, baseUri };
}

export function clearDocusignProfileJwtCache(profileId?: string): void {
  if (profileId) profileSessionCache.delete(profileId);
  else profileSessionCache.clear();
}
