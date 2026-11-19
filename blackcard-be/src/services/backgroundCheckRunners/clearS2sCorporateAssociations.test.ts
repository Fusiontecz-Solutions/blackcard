import {
    mergeClearNamesIntoExhibitPrefill,
    parseClearCorporateAssociations,
    uniqueClearCorporateNames,
} from './clearS2sCorporateAssociations';

describe('parseClearCorporateAssociations', () => {
    const meta = { groupId: 'g1', reportKind: 'person' as const };

    it('parses Corporate Filings names from CorporateSection only', () => {
        const xml = `
          <PersonReport>
            <CorporateSection>
              <Corporation>
                <BusinessName>ACME HOLDINGS LLC</BusinessName>
                <Officer><Name>JOHN OFFICER</Name></Officer>
              </Corporation>
              <Corporation>
                <CompanyName>BETA CORP</CompanyName>
              </Corporation>
            </CorporateSection>
            <BusinessAssociationSection>
              <BusinessAssociation>
                <EntityName>GAMMA PARTNERS INC</EntityName>
              </BusinessAssociation>
            </BusinessAssociationSection>
            <WorkAffiliationSection>
              <WorkAffiliation>
                <EmployerName>DELTA EMPLOYER LLC</EmployerName>
                <BusinessName>SHOULD NOT APPEAR WORK AFFILIATION</BusinessName>
              </WorkAffiliation>
            </WorkAffiliationSection>
            <FictitiousBusinessNameSection>
              <FictitiousBusinessName>
                <BusinessName>DBA NOT A FILING</BusinessName>
              </FictitiousBusinessName>
            </FictitiousBusinessNameSection>
          </PersonReport>
        `;
        const rows = parseClearCorporateAssociations(xml, meta);
        expect(rows.map((r) => r.name).sort()).toEqual([
            'ACME HOLDINGS LLC',
            'BETA CORP',
        ]);
        expect(rows.every((r) => r.section === 'Corporation')).toBe(true);
    });

    it('ignores officer Name tags and work-affiliation employers', () => {
        const xml = `
          <CorporateSection>
            <Corporation>
              <BusinessName>FILING CO LLC</BusinessName>
              <Principal>
                <Name>CRAIG S LINDER</Name>
              </Principal>
            </Corporation>
          </CorporateSection>
          <WorkAffiliationSection>
            <WorkAffiliation>
              <EmployerName>RANDOM JOB INC</EmployerName>
            </WorkAffiliation>
          </WorkAffiliationSection>
        `;
        const rows = parseClearCorporateAssociations(xml, meta);
        expect(rows.map((r) => r.name)).toEqual(['FILING CO LLC']);
    });

    it('dedupes case-insensitively and skips empty section', () => {
        const xml = `
          <CorporateSection>
            <Corporation>
              <BusinessName>Same Co</BusinessName>
              <CompanyName>same co</CompanyName>
            </Corporation>
          </CorporateSection>
          <BusinessAssociationSection></BusinessAssociationSection>
        `;
        expect(parseClearCorporateAssociations(xml, meta)).toHaveLength(1);
    });
});

describe('mergeClearNamesIntoExhibitPrefill', () => {
    it('fills empty exhibit slots without overwriting existing names', () => {
        const result = mergeClearNamesIntoExhibitPrefill(
            { exhibitAValue1: 'Manual Co', otherKey: true },
            ['CLEAR ONE LLC', 'Manual Co', 'CLEAR TWO INC'],
        );
        expect(result.added).toBe(2);
        expect(result.overrides.exhibitAValue1).toBe('Manual Co');
        expect(result.overrides.exhibitAValue2).toBe('CLEAR ONE LLC');
        expect(result.overrides.exhibitAValue3).toBe('CLEAR TWO INC');
        expect(result.overrides.otherKey).toBe(true);
    });

    it('uniqueClearCorporateNames excludes primary business', () => {
        const names = uniqueClearCorporateNames(
            [
                { source: 'clear', name: 'Primary Biz', groupId: 'g', reportKind: 'business' },
                { source: 'clear', name: 'Other Biz', groupId: 'g', reportKind: 'person' },
            ],
            ['Primary Biz'],
        );
        expect(names).toEqual(['Other Biz']);
    });
});
