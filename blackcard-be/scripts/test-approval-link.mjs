import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Quick smoke test — run after: npx tsc && node scripts/test-approval-link.mjs
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

async function main() {
  process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

  const { renderApplicationApprovalEmailHtml } = await import(
    join(root, 'templates/applicationApprovalEmailHtml.js')
  );
  const { applyApplicationApprovalEmailPlaceholders, htmlContainsApprovalUrlPlaceholder } =
    await import(join(root, 'templates/applicationApprovalEmailPlaceholders.js'));
  const { resolveIsoApprovalEmailHtml } = await import(
    join(root, 'services/applicationApprovalEmailRenderService.js')
  );

  const portalUrl = 'http://localhost:5173/public/application/approval/test-token-abc';
  const feHtml = renderApplicationApprovalEmailHtml({
    client_name: 'Test ISO',
    company_name: 'Test Co',
    calculate_approval_url: '__APPLICATION_APPROVAL_URL__',
  });

  console.log('FE html has placeholder:', htmlContainsApprovalUrlPlaceholder(feHtml));
  console.log('FE href sample:', feHtml.match(/href="[^"]{10,80}"/)?.[0]);

  const resolved = resolveIsoApprovalEmailHtml({
    resend: false,
    clientName: 'Test ISO',
    companyName: 'Test Co',
    calculateApprovalUrl: portalUrl,
    customHtml: feHtml,
  });

  console.log('Resolved has placeholder:', htmlContainsApprovalUrlPlaceholder(resolved));
  console.log('Resolved href sample:', resolved.match(/href="[^"]{10,120}"/)?.[0]);
  console.log('Contains portal path:', resolved.includes('/public/application/approval/'));
}

main().catch(console.error);
