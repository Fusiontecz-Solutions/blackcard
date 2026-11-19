import axios, { type AxiosInstance } from '../../../types/http';
import dotenv from 'dotenv';

dotenv.config();

// ─── BoldSign API configuration ───────────────────────────────────────────────
const BOLDSIGN_API_BASE = process.env.BOLDSIGN_API_BASE || 'https://api.boldsign.com';
const BOLDSIGN_AUTH_BASE = process.env.BOLDSIGN_AUTH_BASE || 'https://account.boldsign.com';

export const BOLDSIGN_CLIENT_ID = process.env.BOLDSIGN_CLIENT_ID || '';
export const BOLDSIGN_CLIENT_SECRET = process.env.BOLDSIGN_CLIENT_SECRET || '';
export const BOLDSIGN_REDIRECT_URI = process.env.BOLDSIGN_REDIRECT_URI || '';
export const BOLDSIGN_API_KEY = process.env.BOLDSIGN_API_KEY || 'NTJlNGZlOTEtMWViNi00NjQ0LTkzMGEtZjgyZGFiZjQ5OGIz';
export const BOLDSIGN_WEBHOOK_SECRET = process.env.BOLDSIGN_WEBHOOK_SECRET || '';

export { BOLDSIGN_API_BASE, BOLDSIGN_AUTH_BASE };

// ─── Create an Axios instance pre-configured for BoldSign REST API ────────────
export function createBoldSignApiClient(accessToken: string): AxiosInstance {
    return axios.create({
        baseURL: BOLDSIGN_API_BASE,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
        },
    });
}

// Variant that uses API-Key auth (for server-to-server / webhook verification)
export function createBoldSignApiKeyClient(): AxiosInstance {
    return axios.create({
        baseURL: BOLDSIGN_API_BASE,
        headers: {
            'X-API-KEY': BOLDSIGN_API_KEY,
            Accept: 'application/json',
        },
    });
}
