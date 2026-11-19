import axios, { AxiosInstance } from 'axios';
import { readFileSync } from 'fs';
import { Agent } from 'https';
import { resolve } from 'path';
import {
    ClearS2sClientConfig,
    getClearS2sClientConfig,
} from './clearS2sConfig';

const PERSON_SEARCH_PATH = '/v3/person/searchResults';
const BUSINESS_SEARCH_PATH = '/v2/business/searchResults';

export type ClearPersonSearchSubject = {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    dateOfBirth?: Date | string | null;
    ssn?: string | null;
    phoneNumber?: string | null;
    emailAddress?: string | null;
    driverLicenseNumber?: string | null;
    /** Linked ClientOwner id when available (for match/sync UI). */
    ownerId?: string | null;
    address?: {
        street?: string | null;
        city?: string | null;
        state?: string | null;
        zipCode?: string | null;
        country?: string | null;
    };
};

export type ClearPersonHit = {
    groupId: string;
    personEntityId?: string;
    firstName: string;
    middleName: string;
    lastName: string;
    ssn: string;
    dateOfBirth: string;
    email: string;
    phoneNumber: string;
    address1: string;
    city: string;
    state: string;
    zipCode: string;
    addressBlob: string;
};

export type ClearPersonSearchResult = {
    environment: string;
    statusCode: string;
    subStatusCode?: string;
    groupCount: number;
    resultId?: string;
    groupIds: string[];
    personEntityIds: string[];
    hits: ClearPersonHit[];
    ownerId?: string;
    ownerIndex?: number;
    ownerName?: string;
};

export type ClearBusinessSearchSubject = {
    businessName: string;
    fein?: string | null;
    phoneNumber?: string | null;
    ownerFirstName?: string | null;
    ownerMiddleName?: string | null;
    ownerLastName?: string | null;
    address?: {
        street?: string | null;
        city?: string | null;
        state?: string | null;
        zipCode?: string | null;
        country?: string | null;
    };
};

export type ClearBusinessHit = {
    groupId: string;
    companyEntityId?: string;
    name: string;
    fein: string;
    address1: string;
    city: string;
    state: string;
    zipCode: string;
    addressBlob: string;
};

export type ClearBusinessSearchResult = {
    environment: string;
    statusCode: string;
    subStatusCode?: string;
    groupCount: number;
    resultId?: string;
    groupIds: string[];
    companyEntityIds: string[];
    hits: ClearBusinessHit[];
};

export function escapeXml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function xmlElement(name: string, value: unknown): string {
    const text = String(value ?? '').trim();
    return text ? `<${name}>${escapeXml(text)}</${name}>` : '';
}

function normalizeSsn(value: string | null | undefined): string {
    const digits = String(value ?? '').replace(/\D/g, '');
    if (digits.length === 9) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
    return digits.length === 4 ? digits : '';
}

const PERSON_NAME_SUFFIXES = new Set(['JR', 'SR', 'II', 'III', 'IV', 'V']);

/**
 * Application imports sometimes put the full given name in `firstName`
 * (for example "HERMAN ATILANO JR"). CLEAR's exact-first-name option expects
 * the actual first token, so remove a trailing suffix and use the first token.
 * SSN remains the strong identity criterion.
 */
export function normalizeClearFirstName(value: string | null | undefined): string {
    const tokens = String(value ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    while (tokens.length > 1) {
        const suffix = tokens[tokens.length - 1].replace(/[.,]/g, '').toUpperCase();
        if (!PERSON_NAME_SUFFIXES.has(suffix)) break;
        tokens.pop();
    }
    return tokens[0] ?? '';
}

export function buildPersonSearchXml(
    subject: ClearPersonSearchSubject,
    config: Pick<ClearS2sClientConfig, 'permissiblePurpose'>,
    reference: string,
): string {
    const firstName = normalizeClearFirstName(subject.firstName);
    const lastName = String(subject.lastName ?? '').trim();
    if (!firstName || !lastName) {
        throw new Error('CLEAR Person Search requires the owner first and last name.');
    }

    // Keep criteria minimal — CLEAR ANDs filters; extra fields (DOB/address/email)
    // commonly produce zero matches vs website Locate searches.
    return `<?xml version="1.0" encoding="UTF-8"?>
<ps:PersonSearchRequestV3 xmlns:ps="http://clear.thomsonreuters.com/api/search/2.0">
  <PermissiblePurpose>
    <GLB>${escapeXml(config.permissiblePurpose.glb)}</GLB>
    <DPPA>${escapeXml(config.permissiblePurpose.dppa)}</DPPA>
    <VOTER>${escapeXml(config.permissiblePurpose.voter)}</VOTER>
  </PermissiblePurpose>
  <Reference>${escapeXml(reference.slice(0, 35))}</Reference>
  <Criteria>
    <p1:PersonCriteria xmlns:p1="com/thomsonreuters/schemas/search">
      <NameInfo>
        <AdvancedNameSearch>
          <LastSecondaryNameSoundSimilarOption>false</LastSecondaryNameSoundSimilarOption>
          <SecondaryLastNameOption>OR</SecondaryLastNameOption>
          <FirstNameBeginsWithOption>false</FirstNameBeginsWithOption>
          <FirstNameSoundSimilarOption>false</FirstNameSoundSimilarOption>
          <FirstNameExactMatchOption>true</FirstNameExactMatchOption>
        </AdvancedNameSearch>
        ${xmlElement('LastName', lastName)}
        ${xmlElement('FirstName', firstName)}
      </NameInfo>
      ${xmlElement('SSN', normalizeSsn(subject.ssn))}
    </p1:PersonCriteria>
  </Criteria>
  <Datasources>
    <PublicRecordPeople>true</PublicRecordPeople>
    <NPIRecord>false</NPIRecord>
    <WorldCheckRiskIntelligence>false</WorldCheckRiskIntelligence>
  </Datasources>
</ps:PersonSearchRequestV3>`;
}

export function buildBusinessSearchXml(
    subject: ClearBusinessSearchSubject,
    config: Pick<ClearS2sClientConfig, 'permissiblePurpose'>,
    reference: string,
): string {
    const businessName = String(subject.businessName ?? '').trim();
    if (!businessName) throw new Error('CLEAR Business Search requires a business name.');

    // Keep criteria minimal — business name + FEIN/EIN only.
    return `<?xml version="1.0" encoding="UTF-8"?>
<bs:BusinessSearchRequest xmlns:bs="http://clear.thomsonreuters.com/api/search/2.0">
  <PermissiblePurpose>
    <GLB>${escapeXml(config.permissiblePurpose.glb)}</GLB>
    <DPPA>${escapeXml(config.permissiblePurpose.dppa)}</DPPA>
    <VOTER>${escapeXml(config.permissiblePurpose.voter)}</VOTER>
  </PermissiblePurpose>
  <Reference>${escapeXml(reference.slice(0, 35))}</Reference>
  <Criteria>
    <b1:BusinessCriteria xmlns:b1="com/thomsonreuters/schemas/search">
      ${xmlElement('BusinessName', businessName)}
      <CorporationInfo>
        ${xmlElement('FEIN', String(subject.fein ?? '').replace(/\D/g, ''))}
      </CorporationInfo>
    </b1:BusinessCriteria>
  </Criteria>
  <Datasources>
    <PublicRecordBusiness>true</PublicRecordBusiness>
    <NPIRecord>false</NPIRecord>
    <PublicRecordUCCFilings>true</PublicRecordUCCFilings>
    <WorldCheckRiskIntelligence>false</WorldCheckRiskIntelligence>
  </Datasources>
</bs:BusinessSearchRequest>`;
}

export function decodeXml(value: string): string {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .trim();
}

export function extractAll(xml: string, tag: string): string[] {
    const pattern = new RegExp(
        `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,
        'gi',
    );
    return Array.from(xml.matchAll(pattern), (match) => decodeXml(match[1]));
}

export function extractOne(xml: string, tag: string): string | undefined {
    return extractAll(xml, tag)[0];
}

function firstTagValue(xml: string, tags: string[]): string {
    for (const tag of tags) {
        const value = extractOne(xml, tag);
        if (value) return value;
    }
    return '';
}

function extractNamedBlocks(xml: string, tags: string[]): string[] {
    for (const tag of tags) {
        const pattern = new RegExp(
            `<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,
            'gi',
        );
        const blocks = Array.from(xml.matchAll(pattern), (match) => match[1]);
        if (blocks.length > 0) return blocks;
    }
    return [];
}

/** Split result XML into segments around each GroupId when named result tags are absent. */
export function splitXmlAroundGroupIds(xml: string): string[] {
    const pattern = /<(?:[\w.-]+:)?GroupId\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?GroupId>/gi;
    const matches = Array.from(xml.matchAll(pattern));
    if (matches.length === 0) return [];

    const blocks: string[] = [];
    for (let i = 0; i < matches.length; i += 1) {
        const start = matches[i].index ?? 0;
        const end = i + 1 < matches.length ? (matches[i + 1].index ?? xml.length) : xml.length;
        blocks.push(xml.slice(Math.max(0, start - 400), end));
    }
    return blocks;
}

function buildAddressParts(block: string): {
    address1: string;
    city: string;
    state: string;
    zipCode: string;
    addressBlob: string;
} {
    const address1 = firstTagValue(block, [
        'Street',
        'StreetAddress',
        'Address1',
        'AddressLine1',
        'Addr1',
    ]);
    const city = firstTagValue(block, ['City', 'AddressCity']);
    const state = firstTagValue(block, ['State', 'StateProvince', 'AddressState']);
    const zipCode = firstTagValue(block, ['ZipCode', 'Zip', 'PostalCode', 'AddressZip']);
    const addressBlob = [address1, city, state, zipCode].filter(Boolean).join(', ');
    return { address1, city, state, zipCode, addressBlob };
}

export function parseClearPersonHitBlock(block: string): ClearPersonHit | null {
    const groupId = firstTagValue(block, ['GroupId']);
    const firstName = firstTagValue(block, ['FirstName', 'PersonFirstName']);
    const lastName = firstTagValue(block, ['LastName', 'PersonLastName']);
    if (!groupId && !firstName && !lastName) return null;

    const address = buildAddressParts(block);
    return {
        groupId,
        personEntityId: firstTagValue(block, ['PersonEntityId']) || undefined,
        firstName,
        middleName: firstTagValue(block, ['MiddleName', 'MiddleInitial', 'PersonMiddleName']),
        lastName,
        ssn: firstTagValue(block, ['SSN', 'PersonSSN', 'SocialSecurityNumber']),
        dateOfBirth: firstTagValue(block, [
            'PersonBirthDate',
            'DateOfBirth',
            'DOB',
            'BirthDate',
        ]),
        email: firstTagValue(block, ['EmailAddress', 'Email', 'PersonEmail']),
        phoneNumber: firstTagValue(block, ['PhoneNumber', 'Phone', 'PersonPhone']),
        ...address,
    };
}

/**
 * CLEAR can put GroupId on a PersonGroup wrapper while the identity fields live
 * inside PersonSearchResult. Preserve the document-order association so an SSN-
 * filtered hit still carries the GroupId required to order its report PDF.
 */
function backfillPersonGroupIds(
    hits: ClearPersonHit[],
    resultXml: string,
): ClearPersonHit[] {
    if (hits.length === 0 || hits.every((hit) => hit.groupId)) return hits;

    const groupIds = extractAll(resultXml, 'GroupId')
        .map((value) => value.trim())
        .filter(Boolean);
    if (groupIds.length !== hits.length) return hits;

    return hits.map((hit, index) =>
        hit.groupId ? hit : { ...hit, groupId: groupIds[index] },
    );
}

export function parseClearBusinessHitBlock(block: string): ClearBusinessHit | null {
    const groupId = firstTagValue(block, ['GroupId']);
    const name = firstTagValue(block, [
        'BusinessName',
        'CompanyName',
        'OrganizationName',
    ]);
    if (!groupId && !name) return null;

    const address = buildAddressParts(block);
    return {
        groupId,
        companyEntityId: firstTagValue(block, ['CompanyEntityId', 'BusinessEntityId']) || undefined,
        name,
        fein: firstTagValue(block, ['FEIN', 'EIN', 'TaxId', 'FederalTaxId']),
        ...address,
    };
}

export function parseClearPersonHits(resultXml: string): ClearPersonHit[] {
    const blocks = extractNamedBlocks(resultXml, [
        'PersonSearchResult',
        'PersonResult',
        'PersonGroup',
        'PersonResponseDetail',
    ]);
    const source = blocks.length > 0 ? blocks : splitXmlAroundGroupIds(resultXml);
    const hits: ClearPersonHit[] = [];
    const seen = new Set<string>();
    for (const block of source) {
        const hit = parseClearPersonHitBlock(block);
        if (!hit) continue;
        const key = hit.groupId || `${hit.firstName}|${hit.lastName}|${hit.ssn}|${hits.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push(hit);
    }
    return backfillPersonGroupIds(hits, resultXml);
}

/**
 * Compare a CLEAR SSN to the submitted SSN. CLEAR may return a full SSN,
 * last four only, or a position-preserving mask such as XXX-XX-8980.
 * Every digit CLEAR exposes must agree, with at least four known digits.
 */
export function clearSsnMatchesSubject(
    clearSsn: string | null | undefined,
    subjectSsn: string | null | undefined,
): boolean {
    const subjectDigits = String(subjectSsn ?? '').replace(/\D/g, '');
    if (subjectDigits.length !== 9) return true;

    const raw = String(clearSsn ?? '').trim().toUpperCase();
    if (!raw) return false;

    const clearDigits = raw.replace(/\D/g, '');
    if (clearDigits.length === 9) return clearDigits === subjectDigits;
    if (clearDigits.length === 4) return clearDigits === subjectDigits.slice(-4);

    const mask = raw.replace(/[^0-9X*]/g, '');
    if (mask.length !== 9) return false;

    let knownDigits = 0;
    for (let index = 0; index < mask.length; index += 1) {
        if (!/\d/.test(mask[index])) continue;
        knownDigits += 1;
        if (mask[index] !== subjectDigits[index]) return false;
    }
    return knownDigits >= 4;
}

export function filterClearPersonHitsBySsn(
    hits: ClearPersonHit[],
    subjectSsn: string | null | undefined,
): ClearPersonHit[] {
    const subjectDigits = String(subjectSsn ?? '').replace(/\D/g, '');
    if (subjectDigits.length !== 9) return hits;
    return hits.filter((hit) => clearSsnMatchesSubject(hit.ssn, subjectDigits));
}

/**
 * Compare a CLEAR FEIN/EIN to the submitted tax id. CLEAR may return a full
 * nine-digit FEIN, last four only, or a position-preserving mask such as
 * XX-XXX6789. Every digit CLEAR exposes must agree, with at least four known.
 */
export function clearFeinMatchesSubject(
    clearFein: string | null | undefined,
    subjectFein: string | null | undefined,
): boolean {
    const subjectDigits = String(subjectFein ?? '').replace(/\D/g, '');
    if (subjectDigits.length !== 9) return true;

    const raw = String(clearFein ?? '').trim().toUpperCase();
    if (!raw) return false;

    const clearDigits = raw.replace(/\D/g, '');
    if (clearDigits.length === 9) return clearDigits === subjectDigits;
    if (clearDigits.length === 4) return clearDigits === subjectDigits.slice(-4);

    const mask = raw.replace(/[^0-9X*]/g, '');
    if (mask.length !== 9) return false;

    let knownDigits = 0;
    for (let index = 0; index < mask.length; index += 1) {
        if (!/\d/.test(mask[index])) continue;
        knownDigits += 1;
        if (mask[index] !== subjectDigits[index]) return false;
    }
    return knownDigits >= 4;
}

export function filterClearBusinessHitsByFein(
    hits: ClearBusinessHit[],
    subjectFein: string | null | undefined,
): ClearBusinessHit[] {
    const subjectDigits = String(subjectFein ?? '').replace(/\D/g, '');
    if (subjectDigits.length !== 9) return hits;
    return hits.filter((hit) => clearFeinMatchesSubject(hit.fein, subjectDigits));
}

/**
 * Business results carry GroupId on the parent group element, so hits parsed from
 * the inner result block have none and cannot be matched to a report candidate.
 * Zip them back in document order, and only when every hit has a counterpart.
 */
function backfillBusinessGroupIds(
    hits: ClearBusinessHit[],
    resultXml: string,
): ClearBusinessHit[] {
    if (hits.length === 0 || hits.every((hit) => hit.groupId)) return hits;

    const groupIds = extractAll(resultXml, 'GroupId')
        .map((value) => value.trim())
        .filter(Boolean);
    if (groupIds.length !== hits.length) return hits;

    return hits.map((hit, index) =>
        hit.groupId ? hit : { ...hit, groupId: groupIds[index] },
    );
}

export function parseClearBusinessHits(resultXml: string): ClearBusinessHit[] {
    const blocks = extractNamedBlocks(resultXml, [
        'BusinessSearchResult',
        'BusinessResult',
        'BusinessGroup',
        'BusinessResponseDetail',
    ]);
    const source = blocks.length > 0 ? blocks : splitXmlAroundGroupIds(resultXml);
    const hits: ClearBusinessHit[] = [];
    const seen = new Set<string>();
    for (const block of source) {
        const hit = parseClearBusinessHitBlock(block);
        if (!hit) continue;
        const key = hit.groupId || `${hit.name}|${hit.fein}|${hits.length}`;
        if (seen.has(key)) continue;
        seen.add(key);
        hits.push(hit);
    }
    return backfillBusinessGroupIds(hits, resultXml);
}

function resultIdFromUri(uri: string): string {
    const parsed = new URL(uri);
    const match = parsed.pathname.match(/\/v3\/person\/searchResults\/([^/]+)$/i);
    if (!match) throw new Error('CLEAR returned an invalid Person Search result URI.');
    return decodeURIComponent(match[1]);
}

function businessResultIdFromUri(uri: string): string {
    const parsed = new URL(uri);
    const match = parsed.pathname.match(/\/v2\/business\/searchResults\/([^/]+)$/i);
    if (!match) throw new Error('CLEAR returned an invalid Business Search result URI.');
    return decodeURIComponent(match[1]);
}

/** Shared mTLS + Basic Auth axios client for CLEAR S2S search and report APIs. */
export function createClearS2sHttpClient(config: ClearS2sClientConfig): AxiosInstance {
    const certificatePath = resolve(process.cwd(), config.certificatePath);
    const httpsAgent = new Agent({
        pfx: readFileSync(certificatePath),
        passphrase: config.certificatePassword,
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
    });

    return axios.create({
        baseURL: config.baseUrl,
        timeout: config.timeoutMs,
        httpsAgent,
        proxy: false,
        maxRedirects: 0,
        auth: {
            username: config.username,
            password: config.password,
        },
        headers: {
            Accept: 'application/xml',
        },
        responseType: 'text',
        transformResponse: [(data) => data],
    });
}

export function assertClearSuccess(xml: string, operation: string): {
    statusCode: string;
    subStatusCode?: string;
} {
    const statusCode = extractOne(xml, 'StatusCode') ?? '';
    const subStatusCode = extractOne(xml, 'SubStatusCode');
    if (statusCode !== '200') {
        const message = extractOne(xml, 'Message') || extractOne(xml, 'StatusMessage');
        const detail = [
            statusCode || 'unknown',
            subStatusCode ? `/${subStatusCode}` : '',
            message ? `: ${message}` : '',
        ].join('');
        // Keep enough of the response for Thomson Reuters support tickets.
        const bodySnippet = String(xml ?? '').trim().slice(0, 8_000);
        throw new Error(
            `CLEAR ${operation} failed with status ${detail}.${bodySnippet ? `\n${bodySnippet}` : ''}`,
        );
    }
    return { statusCode, subStatusCode };
}

export async function searchClearPerson(
    subject: ClearPersonSearchSubject,
    reference: string,
    config: ClearS2sClientConfig = getClearS2sClientConfig(),
): Promise<ClearPersonSearchResult> {
    const client = createClearS2sHttpClient(config);
    const requestXml = buildPersonSearchXml(subject, config, reference);
    const postResponse = await client.post(PERSON_SEARCH_PATH, requestXml, {
        headers: { 'Content-Type': 'application/xml' },
    });
    const postXml = String(postResponse.data ?? '');
    const status = assertClearSuccess(postXml, 'Person Search');
    const groupCount = Number(extractOne(postXml, 'GroupCount') ?? 0);
    const uri = extractOne(postXml, 'Uri');

    if (!Number.isInteger(groupCount) || groupCount < 0) {
        throw new Error('CLEAR returned an invalid Person Search group count.');
    }
    if (groupCount === 0) {
        return {
            environment: config.environment,
            ...status,
            groupCount,
            groupIds: [],
            personEntityIds: [],
            hits: [],
        };
    }
    if (!uri) throw new Error('CLEAR Person Search returned matches without a result URI.');

    const resultId = resultIdFromUri(uri);
    const getResponse = await client.get(`${PERSON_SEARCH_PATH}/${encodeURIComponent(resultId)}`, {
        params: { resultType: 'xml' },
    });
    const resultXml = String(getResponse.data ?? '');
    assertClearSuccess(resultXml, 'Person Search result retrieval');

    const hits = filterClearPersonHitsBySsn(parseClearPersonHits(resultXml), subject.ssn);
    const groupIds = [
        ...new Set([
            ...hits.map((hit) => hit.groupId).filter(Boolean),
        ]),
    ];
    const personEntityIds = [
        ...new Set([
            ...hits.map((hit) => hit.personEntityId).filter((id): id is string => Boolean(id)),
        ]),
    ];

    return {
        environment: config.environment,
        ...status,
        groupCount: hits.length,
        resultId,
        groupIds,
        personEntityIds,
        hits,
    };
}

export async function searchClearBusiness(
    subject: ClearBusinessSearchSubject,
    reference: string,
    config: ClearS2sClientConfig = getClearS2sClientConfig(),
): Promise<ClearBusinessSearchResult> {
    const client = createClearS2sHttpClient(config);
    const requestXml = buildBusinessSearchXml(subject, config, reference);
    const postResponse = await client.post(BUSINESS_SEARCH_PATH, requestXml, {
        headers: { 'Content-Type': 'application/xml' },
    });
    const postXml = String(postResponse.data ?? '');
    const status = assertClearSuccess(postXml, 'Business Search');
    const groupCount = Number(extractOne(postXml, 'GroupCount') ?? 0);
    const uri = extractOne(postXml, 'Uri');

    if (!Number.isInteger(groupCount) || groupCount < 0) {
        throw new Error('CLEAR returned an invalid Business Search group count.');
    }
    if (groupCount === 0) {
        return {
            environment: config.environment,
            ...status,
            groupCount,
            groupIds: [],
            companyEntityIds: [],
            hits: [],
        };
    }
    if (!uri) throw new Error('CLEAR Business Search returned matches without a result URI.');

    const resultId = businessResultIdFromUri(uri);
    const getResponse = await client.get(
        `${BUSINESS_SEARCH_PATH}/${encodeURIComponent(resultId)}`,
        { params: { resultType: 'xml' } },
    );
    const resultXml = String(getResponse.data ?? '');
    assertClearSuccess(resultXml, 'Business Search result retrieval');

    // Mirror person SSN filtering: when the application has a full FEIN, drop
    // unrelated CLEAR business hits so PDFs and match review stay on-subject.
    const hits = filterClearBusinessHitsByFein(
        parseClearBusinessHits(resultXml),
        subject.fein,
    );
    const groupIds = [
        ...new Set([
            ...hits.map((hit) => hit.groupId).filter(Boolean),
        ]),
    ];
    const companyEntityIds = [
        ...new Set([
            ...hits.map((hit) => hit.companyEntityId).filter((id): id is string => Boolean(id)),
        ]),
    ];

    return {
        environment: config.environment,
        ...status,
        groupCount: hits.length,
        resultId,
        groupIds,
        companyEntityIds,
        hits,
    };
}
