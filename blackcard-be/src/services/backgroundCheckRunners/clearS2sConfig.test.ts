import {
    CLEAR_S2S_BASE_URLS,
    resolveClearS2sClientConfig,
    resolveClearS2sConfig,
} from './clearS2sConfig';

describe('resolveClearS2sConfig', () => {
    it('defaults to the beta endpoint', () => {
        expect(resolveClearS2sConfig({})).toEqual({
            environment: 'beta',
            baseUrl: CLEAR_S2S_BASE_URLS.beta,
        });
    });

    it('selects the production endpoint explicitly', () => {
        expect(resolveClearS2sConfig({ CLEAR_S2S_ENV: 'production' })).toEqual({
            environment: 'production',
            baseUrl: CLEAR_S2S_BASE_URLS.production,
        });
    });

    it('normalizes an HTTPS base URL override', () => {
        expect(
            resolveClearS2sConfig({
                CLEAR_S2S_ENV: 'beta',
                CLEAR_S2S_BASE_URL: ' https://clear.example.test/api/// ',
            }),
        ).toEqual({
            environment: 'beta',
            baseUrl: 'https://clear.example.test/api',
        });
    });

    it('rejects unsupported environments', () => {
        expect(() =>
            resolveClearS2sConfig({ CLEAR_S2S_ENV: 'staging' }),
        ).toThrow('CLEAR_S2S_ENV must be either "beta" or "production".');
    });

    it('rejects non-HTTPS overrides', () => {
        expect(() =>
            resolveClearS2sConfig({
                CLEAR_S2S_BASE_URL: 'http://clear.example.test/api',
            }),
        ).toThrow('CLEAR_S2S_BASE_URL must use HTTPS.');
    });

    it('rejects malformed overrides', () => {
        expect(() =>
            resolveClearS2sConfig({ CLEAR_S2S_BASE_URL: 'not-a-url' }),
        ).toThrow('CLEAR_S2S_BASE_URL must be a valid HTTPS URL.');
    });
});

describe('resolveClearS2sClientConfig', () => {
    const required = {
        CLEAR_S2S_USERNAME: 'user',
        CLEAR_S2S_PASSWORD: 'password',
        CLEAR_S2S_CERT_PATH: './clear-beta.pfx',
        CLEAR_S2S_CERT_PASSWORD: 'certificate-password',
        CLEAR_S2S_GLB_PURPOSE: 'Q',
        CLEAR_S2S_DPPA_PURPOSE: '0',
        CLEAR_S2S_VOTER_PURPOSE: '7',
    };

    it('requires explicit permissible-purpose and authentication settings', () => {
        expect(() => resolveClearS2sClientConfig({})).toThrow(
            'CLEAR_S2S_USERNAME is required',
        );
    });

    it('resolves the classic Basic Auth and mTLS settings', () => {
        expect(resolveClearS2sClientConfig(required)).toEqual({
            environment: 'beta',
            baseUrl: CLEAR_S2S_BASE_URLS.beta,
            username: 'user',
            password: 'password',
            certificatePath: './clear-beta.pfx',
            certificatePassword: 'certificate-password',
            permissiblePurpose: { glb: 'Q', dppa: '0', voter: '7' },
            timeoutMs: 30_000,
        });
    });
});
