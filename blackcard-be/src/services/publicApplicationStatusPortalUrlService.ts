import { createPublicPortalToken } from './publicPortalTokenService';
import {
    buildPublicApplicationStatusPortalUrl,
    resolveCrmFrontendBaseUrl,
} from '../utils/crmFrontendUrl';

/**
 * Absolute public application status portal URL (comments + status) for email CTAs.
 */
export async function resolvePublicApplicationStatusPortalUrl(
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
        console.error(
            '[statusPortalUrl] token generation failed, using application id:',
            tokenErr,
        );
    }

    return buildPublicApplicationStatusPortalUrl(baseUrl, linkToken);
}
