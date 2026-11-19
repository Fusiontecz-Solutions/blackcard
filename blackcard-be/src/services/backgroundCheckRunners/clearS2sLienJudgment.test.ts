import {
    clearLienJudgmentTitle,
    mergeClearNyCourtEvidence,
    parseClearLienJudgmentRecords,
    toNyCourtEvidenceItem,
} from './clearS2sLienJudgment';

describe('parseClearLienJudgmentRecords', () => {
    const meta = { groupId: 'group-1', reportKind: 'person' as const };

    it('parses judgments-only fixtures', () => {
        const xml = `
          <PersonReport>
            <LienJudgmentSection>
              <Judgment>
                <CaseNumber>CV-100</CaseNumber>
                <CourtName>SUPREME COURT NY</CourtName>
                <FilingDate>01/15/2020</FilingDate>
                <JudgmentAmount>12000</JudgmentAmount>
                <Plaintiff>ACME BANK</Plaintiff>
                <Defendant>JOHN DOE</Defendant>
                <Status>Open</Status>
              </Judgment>
            </LienJudgmentSection>
          </PersonReport>
        `;
        const rows = parseClearLienJudgmentRecords(xml, meta);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            source: 'clear',
            kind: 'judgment',
            groupId: 'group-1',
            caseNumber: 'CV-100',
            court: 'SUPREME COURT NY',
            filingDate: '01/15/2020',
            amount: '12000',
            parties: 'ACME BANK v. JOHN DOE',
            status: 'Open',
        });
    });

    it('parses liens-only fixtures', () => {
        const xml = `
          <BusinessReport>
            <LienJudgmentSection>
              <TaxLien>
                <FilingNumber>TL-55</FilingNumber>
                <FilingOffice>IRS</FilingOffice>
                <FileDate>03/01/2019</FileDate>
                <LienAmount>4500.00</LienAmount>
                <CreditorName>UNITED STATES</CreditorName>
                <DebtorName>KROSS CAPITALS LLC</DebtorName>
              </TaxLien>
            </LienJudgmentSection>
          </BusinessReport>
        `;
        const rows = parseClearLienJudgmentRecords(xml, {
            groupId: 'biz-9',
            reportKind: 'business',
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].kind).toBe('lien');
        expect(rows[0].caseNumber).toBe('TL-55');
        expect(rows[0].court).toBe('IRS');
        expect(rows[0].amount).toBe('4500.00');
    });

    it('parses mixed lien and judgment records', () => {
        const xml = `
          <LienJudgmentSection>
            <Judgement>
              <CaseNo>J-1</CaseNo>
              <Court>COUNTY COURT</Court>
              <Amount>100</Amount>
            </Judgement>
            <Lien>
              <DocumentType>State Tax Lien</DocumentType>
              <FileNumber>L-2</FileNumber>
              <CourtName>NYS TAX</CourtName>
              <Amount>200</Amount>
            </Lien>
          </LienJudgmentSection>
        `;
        const rows = parseClearLienJudgmentRecords(xml, meta);
        expect(rows.map((r) => r.kind).sort()).toEqual(['judgment', 'lien']);
        expect(rows.find((r) => r.kind === 'judgment')?.caseNumber).toBe('J-1');
        expect(rows.find((r) => r.kind === 'lien')?.caseNumber).toBe('L-2');
    });

    it('returns empty for empty section', () => {
        const xml = `<PersonReport><LienJudgmentSection></LienJudgmentSection></PersonReport>`;
        expect(parseClearLienJudgmentRecords(xml, meta)).toEqual([]);
    });

    it('handles unknown wrapper tags via DocumentType', () => {
        const xml = `
          <LienAndJudgment>
            <DocumentType>Federal Tax Lien</DocumentType>
            <FilingNumber>X-9</FilingNumber>
            <CourtName>USDIST</CourtName>
            <FilingDate>2021-04-04</FilingDate>
            <TotalAmount>999</TotalAmount>
          </LienAndJudgment>
        `;
        const rows = parseClearLienJudgmentRecords(xml, meta);
        expect(rows).toHaveLength(1);
        expect(rows[0].kind).toBe('lien');
        expect(rows[0].caseNumber).toBe('X-9');
    });

    it('parses CLEAR Result-style filings shaped like the PDF Liens & Judgments section', () => {
        const xml = `
          <PersonReportResults>
            <LienJudgmentSection>
              <Result>
                <CaseNumber>E035651395</CaseNumber>
                <FilingType>NY STATE TAX WARRANT</FilingType>
                <FilingDate>08/21/2012</FilingDate>
                <JudgmentAmount>2686.23</JudgmentAmount>
                <DebtorName>LEWIN, ARTURO E</DebtorName>
                <CreditorName>NY STATE DEP'T OF TAXATION AND FINANCE</CreditorName>
                <FilingCounty>NEW YORK</FilingCounty>
                <Status>FULL</Status>
              </Result>
              <Document>
                <FilingNumber>436122</FilingNumber>
                <FilingType>JUDGMENT</FilingType>
                <FilingDate>02/12/2008</FilingDate>
                <AwardAmount>42132.00</AwardAmount>
                <DebtorName>CMS CONTRACTING</DebtorName>
                <CreditorName>ARTURO E LEWIN</CreditorName>
                <FilingOffice>CIRCUIT COURT</FilingOffice>
                <JudgmentStatus>UNSATISFIED</JudgmentStatus>
              </Document>
              <Detail>
                <FilingType>STATE LIEN OR CERTIFICATE OF DEBT DOCKETED WITH CLERK OF SUPERIOR COURT</FilingType>
                <FilingDate>11/21/2000</FilingDate>
                <VendorNumber>DJ-00223600-2000</VendorNumber>
                <DebtorName>ARTURO E LEWIN</DebtorName>
                <CreditorName>DIV OF MOTOR VEHICLES</CreditorName>
                <PrincipalAmount>350.00</PrincipalAmount>
                <Court>NJ000DJ</Court>
              </Detail>
            </LienJudgmentSection>
          </PersonReportResults>
        `;
        const rows = parseClearLienJudgmentRecords(xml, meta);
        expect(rows.length).toBeGreaterThanOrEqual(3);
        expect(rows.some((row) => row.caseNumber === 'E035651395')).toBe(true);
        expect(rows.some((row) => row.caseNumber === '436122' && row.kind === 'judgment')).toBe(true);
        expect(
            rows.some(
                (row) =>
                    row.kind === 'lien' &&
                    (row.caseNumber === 'DJ-00223600-2000' || /certificate of debt/i.test(row.description ?? '')),
            ),
        ).toBe(true);
    });
});

describe('NY Court evidence mapping', () => {
    it('builds record evidence and merges without duplicating CLEAR rows', () => {
        const record = parseClearLienJudgmentRecords(
            `<Judgment><CaseNumber>A</CaseNumber><CourtName>C</CourtName><Amount>1</Amount></Judgment>`,
            { groupId: 'g1', reportKind: 'person' },
        )[0];
        const item = toNyCourtEvidenceItem(record, 'https://cdn.example/clear.pdf');
        expect(item.kind).toBe('record');
        expect(item.source).toBe('clear');
        expect(item.url).toBe('https://cdn.example/clear.pdf');
        expect(clearLienJudgmentTitle(record)).toContain('Judgment');

        const pdfMap = new Map([['g1', 'https://cdn.example/clear.pdf']]);
        const mergedOnce = mergeClearNyCourtEvidence(
            [{ id: 'link-1', kind: 'link', url: 'https://example.com', name: 'manual' }],
            [record],
            pdfMap,
        );
        expect(mergedOnce).toHaveLength(2);
        expect(mergedOnce[0].id).toBe('link-1');

        const mergedTwice = mergeClearNyCourtEvidence(mergedOnce, [record], pdfMap);
        expect(mergedTwice.filter((row) => row.source === 'clear')).toHaveLength(1);
        expect(mergedTwice.find((row) => row.id === 'link-1')).toBeTruthy();
    });
});
