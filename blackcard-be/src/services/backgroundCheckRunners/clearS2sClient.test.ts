import {
    buildBusinessSearchXml,
    buildPersonSearchXml,
    clearFeinMatchesSubject,
    clearSsnMatchesSubject,
    filterClearBusinessHitsByFein,
    filterClearPersonHitsBySsn,
    normalizeClearFirstName,
    parseClearBusinessHits,
    parseClearPersonHits,
} from './clearS2sClient';

describe('buildPersonSearchXml', () => {
    const config = {
        permissiblePurpose: { glb: 'Q', dppa: '0', voter: '7' },
    };

    it('builds an exact Person Search with normalized first name and SSN', () => {
        const xml = buildPersonSearchXml(
            {
                firstName: 'Jane Quinn Jr',
                middleName: 'Quinn',
                lastName: 'Sample',
                dateOfBirth: new Date('1980-02-03T00:00:00.000Z'),
                ssn: '123456789',
                emailAddress: 'jane@example.com',
                address: {
                    street: '1 Main <Street>',
                    city: 'Albany',
                    state: 'ny',
                    zipCode: '12207',
                    country: 'USA',
                },
            },
            config,
            'Ocean application-1',
        );

        expect(xml).toContain('<ps:PersonSearchRequestV3');
        expect(xml).toContain('<GLB>Q</GLB>');
        expect(xml).toContain('<FirstName>Jane</FirstName>');
        expect(xml).toContain('<LastName>Sample</LastName>');
        expect(xml).toContain('<SSN>123-45-6789</SSN>');
        expect(xml).toContain('<FirstNameExactMatchOption>true</FirstNameExactMatchOption>');
        expect(xml).toContain('<WorldCheckRiskIntelligence>false</WorldCheckRiskIntelligence>');
        expect(xml).not.toContain('<MiddleInitial>');
        expect(xml).not.toContain('<Street>');
        expect(xml).not.toContain('<PersonBirthDate>');
        expect(xml).not.toContain('<EmailAddress>');
    });

    it('normalizes imported compound given names and suffixes', () => {
        expect(normalizeClearFirstName('HERMAN ATILANO JR')).toBe('HERMAN');
        expect(normalizeClearFirstName('Jane Sr.')).toBe('Jane');
        expect(normalizeClearFirstName('Mary')).toBe('Mary');
    });

    it('rejects a request without the owner name', () => {
        expect(() =>
            buildPersonSearchXml(
                { firstName: '', lastName: '' },
                config,
                'Ocean application-1',
            ),
        ).toThrow(/first and last name/i);
    });
});

describe('buildBusinessSearchXml', () => {
    it('builds Business Search with name and FEIN only', () => {
        const xml = buildBusinessSearchXml(
            {
                businessName: 'Example & Sons LLC',
                fein: '12-3456789',
                phoneNumber: '212-555-0100',
                ownerFirstName: 'Jane',
                ownerLastName: 'Owner',
                address: {
                    street: '10 Main Street',
                    city: 'New York',
                    state: 'ny',
                    zipCode: '10001',
                    country: 'USA',
                },
            },
            { permissiblePurpose: { glb: 'Q', dppa: '0', voter: '7' } },
            'Ocean application-1 Business',
        );

        expect(xml).toContain('<bs:BusinessSearchRequest');
        expect(xml).toContain('<BusinessName>Example &amp; Sons LLC</BusinessName>');
        expect(xml).toContain('<FEIN>123456789</FEIN>');
        expect(xml).toContain('<PublicRecordBusiness>true</PublicRecordBusiness>');
        expect(xml).toContain('<PublicRecordUCCFilings>true</PublicRecordUCCFilings>');
        expect(xml).not.toContain('<State>');
        expect(xml).not.toContain('<FirstName>');
        expect(xml).not.toContain('<PhoneNumber>');
    });
});

describe('CLEAR SSN candidate filtering', () => {
    const subjectSsn = '585-04-8980';

    it('accepts exact, last-four, and compatible masked SSNs', () => {
        expect(clearSsnMatchesSubject('585-04-8980', subjectSsn)).toBe(true);
        expect(clearSsnMatchesSubject('8980', subjectSsn)).toBe(true);
        expect(clearSsnMatchesSubject('XXX-XX-8980', subjectSsn)).toBe(true);
        expect(clearSsnMatchesSubject('585-04-89XX', subjectSsn)).toBe(true);
    });

    it('rejects unrelated and missing SSNs', () => {
        expect(clearSsnMatchesSubject('057-89-XXXX', subjectSsn)).toBe(false);
        expect(clearSsnMatchesSubject('584-54-XXXX', subjectSsn)).toBe(false);
        expect(clearSsnMatchesSubject('', subjectSsn)).toBe(false);
    });

    it('keeps only candidates compatible with the submitted SSN', () => {
        const base = {
            groupId: '',
            firstName: '',
            middleName: '',
            lastName: '',
            dateOfBirth: '',
            email: '',
            phoneNumber: '',
            address1: '',
            city: '',
            state: '',
            zipCode: '',
            addressBlob: '',
        };
        const hits = [
            { ...base, groupId: 'matching', ssn: 'XXX-XX-8980' },
            { ...base, groupId: 'unrelated', ssn: '057-89-XXXX' },
            { ...base, groupId: 'missing', ssn: '' },
        ];

        expect(filterClearPersonHitsBySsn(hits, subjectSsn).map((hit) => hit.groupId)).toEqual([
            'matching',
        ]);
    });

    it('does not filter when the application lacks a full SSN', () => {
        const hits = [
            {
                groupId: 'candidate',
                firstName: 'Jane',
                middleName: '',
                lastName: 'Doe',
                ssn: '',
                dateOfBirth: '',
                email: '',
                phoneNumber: '',
                address1: '',
                city: '',
                state: '',
                zipCode: '',
                addressBlob: '',
            },
        ];
        expect(filterClearPersonHitsBySsn(hits, null)).toEqual(hits);
    });
});

describe('CLEAR FEIN candidate filtering', () => {
    const subjectFein = '12-3456789';

    it('accepts exact, last-four, and compatible masked FEINs', () => {
        expect(clearFeinMatchesSubject('12-3456789', subjectFein)).toBe(true);
        expect(clearFeinMatchesSubject('123456789', subjectFein)).toBe(true);
        expect(clearFeinMatchesSubject('6789', subjectFein)).toBe(true);
        expect(clearFeinMatchesSubject('XX-XXX6789', subjectFein)).toBe(true);
        expect(clearFeinMatchesSubject('12-34567XX', subjectFein)).toBe(true);
    });

    it('rejects unrelated and missing FEINs', () => {
        expect(clearFeinMatchesSubject('98-7654321', subjectFein)).toBe(false);
        expect(clearFeinMatchesSubject('XX-XXX0000', subjectFein)).toBe(false);
        expect(clearFeinMatchesSubject('', subjectFein)).toBe(false);
    });

    it('keeps only candidates compatible with the submitted FEIN', () => {
        const base = {
            groupId: '',
            name: '',
            address1: '',
            city: '',
            state: '',
            zipCode: '',
            addressBlob: '',
        };
        const hits = [
            { ...base, groupId: 'matching', name: 'Acme LLC', fein: 'XX-XXX6789' },
            { ...base, groupId: 'unrelated', name: 'Other LLC', fein: '98-7654321' },
            { ...base, groupId: 'missing', name: 'No Tax Id LLC', fein: '' },
        ];

        expect(filterClearBusinessHitsByFein(hits, subjectFein).map((hit) => hit.groupId)).toEqual([
            'matching',
        ]);
    });

    it('does not filter when the application lacks a full FEIN', () => {
        const hits = [
            {
                groupId: 'candidate',
                name: 'Acme LLC',
                fein: '',
                address1: '',
                city: '',
                state: '',
                zipCode: '',
                addressBlob: '',
            },
        ];
        expect(filterClearBusinessHitsByFein(hits, null)).toEqual(hits);
        expect(filterClearBusinessHitsByFein(hits, '12-345')).toEqual(hits);
    });
});

describe('parseClearPersonHits', () => {
    it('parses person hit fields from result XML', () => {
        const xml = `
          <Status><StatusCode>200</StatusCode></Status>
          <PersonSearchResult>
            <GroupId>person-group-1</GroupId>
            <PersonEntityId>pe-1</PersonEntityId>
            <FirstName>Jane</FirstName>
            <MiddleName>Q</MiddleName>
            <LastName>Doe</LastName>
            <SSN>123-45-6789</SSN>
            <PersonBirthDate>1980-02-03</PersonBirthDate>
            <Street>1 Main St</Street>
            <City>Albany</City>
            <State>NY</State>
            <ZipCode>12207</ZipCode>
            <EmailAddress>jane@example.com</EmailAddress>
            <PhoneNumber>5185550100</PhoneNumber>
          </PersonSearchResult>
        `;
        expect(parseClearPersonHits(xml)).toEqual([
            expect.objectContaining({
                groupId: 'person-group-1',
                personEntityId: 'pe-1',
                firstName: 'Jane',
                middleName: 'Q',
                lastName: 'Doe',
                ssn: '123-45-6789',
                dateOfBirth: '1980-02-03',
                address1: '1 Main St',
                city: 'Albany',
                state: 'NY',
                zipCode: '12207',
                email: 'jane@example.com',
                phoneNumber: '5185550100',
            }),
        ]);
    });

    it('keeps the parent GroupId on a nested person result so its PDF can be ordered', () => {
        const xml = `
          <PersonGroup>
            <GroupId>person-report-group-1</GroupId>
            <PersonSearchResult>
              <FirstName>John</FirstName>
              <LastName>Polanco</LastName>
              <SSN>466-93-XXXX</SSN>
            </PersonSearchResult>
          </PersonGroup>
        `;

        expect(parseClearPersonHits(xml)).toEqual([
            expect.objectContaining({
                groupId: 'person-report-group-1',
                firstName: 'John',
                lastName: 'Polanco',
                ssn: '466-93-XXXX',
            }),
        ]);
    });
});

describe('parseClearBusinessHits', () => {
    it('parses business hit fields from result XML', () => {
        const xml = `
          <Status><StatusCode>200</StatusCode></Status>
          <BusinessSearchResult>
            <GroupId>biz-group-1</GroupId>
            <CompanyEntityId>ce-1</CompanyEntityId>
            <BusinessName>Acme LLC</BusinessName>
            <FEIN>123456789</FEIN>
            <Street>10 Main Street</Street>
            <City>New York</City>
            <State>NY</State>
            <ZipCode>10001</ZipCode>
          </BusinessSearchResult>
        `;
        expect(parseClearBusinessHits(xml)).toEqual([
            expect.objectContaining({
                groupId: 'biz-group-1',
                companyEntityId: 'ce-1',
                name: 'Acme LLC',
                fein: '123456789',
                address1: '10 Main Street',
                city: 'New York',
                state: 'NY',
                zipCode: '10001',
            }),
        ]);
    });

    it('backfills GroupId when CLEAR nests it on the parent group element', () => {
        const xml = `
          <Status><StatusCode>200</StatusCode></Status>
          <BusinessGroup>
            <GroupId>biz-group-1</GroupId>
            <BusinessSearchResult>
              <CompanyEntityId>ce-1</CompanyEntityId>
              <BusinessName>Acme LLC</BusinessName>
            </BusinessSearchResult>
          </BusinessGroup>
          <BusinessGroup>
            <GroupId>biz-group-2</GroupId>
            <BusinessSearchResult>
              <CompanyEntityId>ce-2</CompanyEntityId>
              <BusinessName>Acme LLC</BusinessName>
              <City>New York</City>
              <State>NY</State>
            </BusinessSearchResult>
          </BusinessGroup>
        `;

        expect(parseClearBusinessHits(xml)).toEqual([
            expect.objectContaining({ groupId: 'biz-group-1', companyEntityId: 'ce-1' }),
            expect.objectContaining({
                groupId: 'biz-group-2',
                companyEntityId: 'ce-2',
                city: 'New York',
                state: 'NY',
            }),
        ]);
    });

    it('leaves GroupId empty when the counts do not line up', () => {
        const xml = `
          <BusinessGroup>
            <GroupId>biz-group-1</GroupId>
            <BusinessSearchResult><BusinessName>Acme LLC</BusinessName></BusinessSearchResult>
            <BusinessSearchResult><BusinessName>Acme Holdings LLC</BusinessName></BusinessSearchResult>
          </BusinessGroup>
        `;

        expect(parseClearBusinessHits(xml).map((hit) => hit.groupId)).toEqual(['', '']);
    });
});
