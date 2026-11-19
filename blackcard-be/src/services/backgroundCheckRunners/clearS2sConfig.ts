export const CLEAR_S2S_BASE_URLS = {
    beta: 'https://s2s.beta.thomsonreuters.com/api',
    production: 'https://s2s.thomsonreuters.com/api',
} as const;

export type ClearS2sEnvironment = keyof typeof CLEAR_S2S_BASE_URLS;

export type ClearS2sConfig = {
    environment: ClearS2sEnvironment;
    baseUrl: string;
};

export type ClearS2sClientConfig = ClearS2sConfig & {
    username: string;
    password: string;
    certificatePath: string;
    certificatePassword: string;
    permissiblePurpose: {
        glb: string;
        dppa: string;
        voter: string;
    };
    timeoutMs: number;
};

type ClearS2sEnvironmentVariables = {
    CLEAR_S2S_ENV?: string;
    CLEAR_S2S_BASE_URL?: string;
    CLEAR_S2S_USERNAME?: string;
    CLEAR_S2S_PASSWORD?: string;
    CLEAR_S2S_CERT_PATH?: string;
    CLEAR_S2S_CERT_PASSWORD?: string;
    CLEAR_S2S_GLB_PURPOSE?: string;
    CLEAR_S2S_DPPA_PURPOSE?: string;
    CLEAR_S2S_VOTER_PURPOSE?: string;
    CLEAR_S2S_TIMEOUT_MS?: string;
};

function parseEnvironment(value: string | undefined): ClearS2sEnvironment {
    const normalized = String(value ?? 'beta').trim().toLowerCase();
    if (normalized === 'beta' || normalized === 'production') return normalized;
    throw new Error('CLEAR_S2S_ENV must be either "beta" or "production".');
}

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim().replace(/\/+$/, '');
    let parsed: URL;

    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error('CLEAR_S2S_BASE_URL must be a valid HTTPS URL.');
    }

    if (parsed.protocol !== 'https:') {
        throw new Error('CLEAR_S2S_BASE_URL must use HTTPS.');
    }

    return trimmed;
}

/**
 * Resolves Thomson Reuters CLEAR S2S V2 environment configuration.
 *
 * Environment variables:
 * - CLEAR_S2S_ENV=beta|production (defaults to beta)
 * - CLEAR_S2S_BASE_URL=https://... (optional environment-specific override)
 *
 * This module intentionally contains no authentication or request logic until
 * Thomson Reuters provides the customer-specific S2S V2 contract.
 */
export function resolveClearS2sConfig(
    env: ClearS2sEnvironmentVariables = process.env,
): ClearS2sConfig {
    const environment = parseEnvironment(env.CLEAR_S2S_ENV);
    const configuredBaseUrl = String(env.CLEAR_S2S_BASE_URL ?? '').trim();
    const baseUrl = normalizeBaseUrl(
        configuredBaseUrl || CLEAR_S2S_BASE_URLS[environment],
    );

    return { environment, baseUrl };
}

export function getClearS2sConfig(): ClearS2sConfig {
    return resolveClearS2sConfig(process.env);
}

function required(env: ClearS2sEnvironmentVariables, key: keyof ClearS2sEnvironmentVariables): string {
    const value = String(env[key] ?? '').trim();
    if (!value) throw new Error(`${key} is required for Thomson Reuters CLEAR S2S.`);
    return value;
}

function parseTimeout(value: string | undefined): number {
    const timeoutMs = Number(value ?? 30_000);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
        throw new Error('CLEAR_S2S_TIMEOUT_MS must be an integer between 1000 and 120000.');
    }
    return timeoutMs;
}

/**
 * Resolves the credentials needed by the classic CLEAR S2S BETA/PROD service:
 * HTTP Basic authentication plus the Thomson Reuters-issued PKCS#12 client
 * certificate. Permissible-purpose values are deliberately required instead
 * of defaulted because they must match the organization's approved use.
 */
export function resolveClearS2sClientConfig(
    env: ClearS2sEnvironmentVariables = process.env,
): ClearS2sClientConfig {
    return {
        ...resolveClearS2sConfig(env),
        username: required(env, 'CLEAR_S2S_USERNAME'),
        password: required(env, 'CLEAR_S2S_PASSWORD'),
        certificatePath: required(env, 'CLEAR_S2S_CERT_PATH'),
        certificatePassword: required(env, 'CLEAR_S2S_CERT_PASSWORD'),
        permissiblePurpose: {
            glb: required(env, 'CLEAR_S2S_GLB_PURPOSE'),
            dppa: required(env, 'CLEAR_S2S_DPPA_PURPOSE'),
            voter: required(env, 'CLEAR_S2S_VOTER_PURPOSE'),
        },
        timeoutMs: parseTimeout(env.CLEAR_S2S_TIMEOUT_MS),
    };
}

export function getClearS2sClientConfig(): ClearS2sClientConfig {
    return resolveClearS2sClientConfig(process.env);
}
