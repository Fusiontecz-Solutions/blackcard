import { renderApplicationApprovalEmailHtml } from '../src/templates/applicationApprovalEmailHtml';
import {
    applyApplicationApprovalEmailPlaceholders,
    htmlContainsApprovalUrlPlaceholder,
} from '../src/templates/applicationApprovalEmailPlaceholders';
import { resolveIsoApprovalEmailHtml } from '../src/services/applicationApprovalEmailRenderService';

process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const portalUrl = 'http://localhost:5173/public/application/approval/test-token-abc';

const feHtml = renderApplicationApprovalEmailHtml({
    client_name: 'Test ISO',
    company_name: 'Test Co',
    calculate_approval_url: '__APPLICATION_APPROVAL_URL__',
});

console.log('1 FE html has placeholder:', htmlContainsApprovalUrlPlaceholder(feHtml));
const href1 = feHtml.match(/href="([^"]+)"/g)?.find((h) => h.includes('APPLICATION') || h.includes('localhost'));
console.log('1 FE href:', href1);

const resolved = resolveIsoApprovalEmailHtml({
    resend: false,
    clientName: 'Test ISO',
    companyName: 'Test Co',
    calculateApprovalUrl: portalUrl,
    customHtml: feHtml,
});

console.log('2 Resolved has placeholder:', htmlContainsApprovalUrlPlaceholder(resolved));
const href2 = resolved.match(/href="([^"]+)"/g)?.find((h) => h.includes('public/application') || h.includes('APPLICATION'));
console.log('2 Resolved href:', href2);

const serverOnly = resolveIsoApprovalEmailHtml({
    resend: false,
    clientName: 'Test ISO',
    companyName: 'Test Co',
    calculateApprovalUrl: portalUrl,
});

console.log('3 Server-only has placeholder:', htmlContainsApprovalUrlPlaceholder(serverOnly));
const href3 = serverOnly.match(/href="([^"]+)"/g)?.find((h) => h.includes('public/application') || h.includes('APPLICATION'));
console.log('3 Server-only href:', href3);
