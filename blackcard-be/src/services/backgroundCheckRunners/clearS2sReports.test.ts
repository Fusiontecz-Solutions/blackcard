import {
    buildBusinessReportXml,
    buildPersonReportXml,
    clearReportFileName,
    selectClearReportGroupIds,
    sliceGroupIdForFileName,
} from './clearS2sReports';

describe('buildPersonReportXml', () => {
    const config = {
        permissiblePurpose: { glb: 'Q', dppa: '0', voter: '7' },
    };

    it('builds a Person Report request with GroupID, Individual choice, WorldCheck off, and purpose codes', () => {
        const xml = buildPersonReportXml('group-abc-123', config, 'Ocean application-1 PersRpt1');

        expect(xml).toContain('<pr:PersonReportRequest xmlns:pr="http://clear.thomsonreuters.com/api/report/2.0">');
        expect(xml).toContain('xmlns:rc="com/thomsonreuters/schemas/person-report"');
        expect(xml).toContain('<GroupID>group-abc-123</GroupID>');
        expect(xml).toContain('<ReportChoice>Individual</ReportChoice>');
        expect(xml).toContain('<AddressSection>true</AddressSection>');
        expect(xml).toContain('<WorkAffiliationSection>true</WorkAffiliationSection>');
        expect(xml).toContain('<CorporateSection>true</CorporateSection>');
        expect(xml).toContain('<CriminalSection>true</CriminalSection>');
        expect(xml).not.toContain('<BusinessAssociationSection>');
        expect(xml).toContain('<WorldCheckSection>false</WorldCheckSection>');
        expect(xml).toContain('<GLB>Q</GLB>');
        expect(xml).toContain('<DPPA>0</DPPA>');
        expect(xml).toContain('<VOTER>7</VOTER>');
        expect(xml).toContain('<Reference>Ocean application-1 PersRpt1</Reference>');
    });

    it('escapes GroupID and rejects an empty GroupID', () => {
        expect(buildPersonReportXml('a&b<c>', config, 'ref')).toContain(
            '<GroupID>a&amp;b&lt;c&gt;</GroupID>',
        );
        expect(() => buildPersonReportXml('  ', config, 'ref')).toThrow(/GroupID/i);
    });
});

describe('buildBusinessReportXml', () => {
    it('builds a Business Report request with GroupID, Business choice, WorldCheck off, and purpose codes', () => {
        const xml = buildBusinessReportXml(
            'biz-group-9',
            { permissiblePurpose: { glb: 'Q', dppa: '0', voter: '7' } },
            'Ocean application-1 BizRpt',
        );

        expect(xml).toContain('<br:BusinessReportRequest xmlns:br="http://clear.thomsonreuters.com/api/report/2.0">');
        expect(xml).toContain('xmlns:rc="com/thomsonreuters/schemas/company-report"');
        expect(xml).toContain('<GroupID>biz-group-9</GroupID>');
        expect(xml).toContain('<ReportChoice>Business</ReportChoice>');
        expect(xml).toContain('<BusinessOverviewSection>true</BusinessOverviewSection>');
        expect(xml).toContain('<CorporateSection>true</CorporateSection>');
        expect(xml).toContain('<WorldCheckSection>false</WorldCheckSection>');
        expect(xml).toContain('<GLB>Q</GLB>');
        expect(xml).toContain('<DPPA>0</DPPA>');
        expect(xml).toContain('<VOTER>7</VOTER>');
    });
});

describe('selectClearReportGroupIds', () => {
    it('keeps up to three unique business and person groupIds', () => {
        const selected = selectClearReportGroupIds({
            businessSearch: { groupIds: ['b1', 'b1', 'b2', 'b3', 'b4'] },
            personSearches: [
                { groupIds: ['p1', 'p1', 'p2'] },
                { groupIds: ['p2', 'p3', 'p4'] },
            ],
        });

        expect(selected.businessGroupId).toBe('b1');
        expect(selected.businessGroupIds).toEqual(['b1', 'b2', 'b3']);
        expect(selected.personGroupIds).toEqual(['p1', 'p2', 'p3']);
    });

    it('prefers business hits with address detail over name-only hits', () => {
        const selected = selectClearReportGroupIds({
            businessSearch: {
                groupIds: ['thin1', 'thin2', 'full1', 'partial1', 'full2'],
                hits: [
                    { groupId: 'thin1' },
                    { groupId: 'thin2' },
                    {
                        groupId: 'full1',
                        address1: '825 Maple Woods Dr',
                        city: 'Pensacola',
                        state: 'FL',
                        zipCode: '32534',
                    },
                    { groupId: 'partial1', state: 'FL' },
                    {
                        groupId: 'full2',
                        address1: '825 Maple Woods Drive',
                        city: 'Pensacola',
                        state: 'FL',
                        zipCode: '32534',
                    },
                ],
            },
            personSearches: [],
        });

        expect(selected.businessGroupIds).toEqual(['full1', 'full2', 'partial1']);
        expect(selected.businessGroupId).toBe('full1');
    });

    it('keeps CLEAR result order when no hit carries address detail', () => {
        const selected = selectClearReportGroupIds({
            businessSearch: {
                groupIds: ['b1', 'b2'],
                hits: [{ groupId: 'b1' }, { groupId: 'b2' }],
            },
        });

        expect(selected.businessGroupIds).toEqual(['b1', 'b2']);
    });
});

describe('clear report filenames', () => {
    it('builds stable CLEAR report PDF names from a groupId slice', () => {
        expect(sliceGroupIdForFileName('Ab12-Cd34-Extra')).toBe('Ab12-Cd3');
        expect(clearReportFileName('person', 'Ab12-Cd34-Extra')).toBe(
            'CLEAR-Person-Report-Ab12-Cd3.pdf',
        );
        expect(clearReportFileName('business', 'biz99999')).toBe(
            'CLEAR-Business-Report-biz99999.pdf',
        );
    });
});
