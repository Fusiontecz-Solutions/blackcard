import './../config/loadEnv';
import { createPublicPortalToken } from '../services/publicPortalTokenService';

(async () => {
    const appId = process.argv[2] || 'd4fc042a-7947-438a-99c5-75c420bb5e16';
    const token = await createPublicPortalToken(appId, { expiresInDays: 7 });
    if (!token) {
        console.error('Failed to mint token (table not ready?)');
        process.exit(1);
    }
    console.log('APPROVAL_URL=http://localhost:5173/public/application/approval/' + token);
    process.exit(0);
})();
