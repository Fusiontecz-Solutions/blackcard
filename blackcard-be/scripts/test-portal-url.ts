import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { resolveCrmFrontendBaseUrl } from '../src/utils/crmFrontendUrl';
import { resolveIsoApprovalPortalUrl } from '../src/services/isoApprovalPortalUrlService';

async function main() {
    const base = resolveCrmFrontendBaseUrl();
    console.log('FRONTEND_URL env:', process.env.FRONTEND_URL);
    console.log('resolveCrmFrontendBaseUrl:', base);

    const fakeAppId = '00000000-0000-4000-8000-000000000001';
    const portal = await resolveIsoApprovalPortalUrl(fakeAppId);
    console.log('resolveIsoApprovalPortalUrl:', portal);
}

main().catch(console.error);
