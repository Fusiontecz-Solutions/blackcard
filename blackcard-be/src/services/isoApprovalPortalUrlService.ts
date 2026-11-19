import { createPublicPortalToken } from './publicPortalTokenService';
import { resolveCrmFrontendBaseUrl } from '../utils/crmFrontendUrl';

/**
 * Absolute public ISO approval portal URL for email CTAs.
 * Mirrors `resolveApplicationApprovalEmailContext` — always falls back to the
 * application UUID when a signed portal token cannot be created.
 */
export async function resolveIsoApprovalPortalUrl(
    applicationUuid: string,
    options?: { expiresInDays?: number },
): Promise<string | undefined> {
    const appId = String(applicationUuid || '').trim();
    if (!appId) return undefined;

    const baseUrl = resolveCrmFrontendBaseUrl()?.replace(/\/$/, '');
    if (!baseUrl) return undefined;

    let linkToken = appId;
    try {
        const portalToken = await createPublicPortalToken(appId, {
            expiresInDays: options?.expiresInDays ?? 90,
        });
        if (portalToken) {
            linkToken = portalToken;
        }
    } catch (tokenErr) {
        console.error('[isoApprovalPortalUrl] token generation failed, using application id:', tokenErr);
    }

    return `${baseUrl}/public/application/approval/${linkToken}`;
}
