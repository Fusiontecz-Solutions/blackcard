jest.mock('./letterHtmlToPdf.service', () => ({
  renderHtmlToA4PdfBuffer: jest.fn(),
}));

import {
  buildClearMatchSectionsHtml,
  buildClearReportSectionsHtml,
} from './backgroundCheckReport.service';

describe('buildClearReportSectionsHtml', () => {
  it('renders CLEAR judgements, liens, and corporations', () => {
    const html = buildClearReportSectionsHtml({
      clearLienJudgments: [
        {
          kind: 'judgment',
          description: 'Civil judgment',
          caseNumber: 'CV-123',
          court: 'Supreme Court',
          amount: '$12,500',
          pdfUrl: 'https://example.com/clear-person.pdf',
        },
        {
          kind: 'lien',
          description: 'Federal tax lien',
          filingDate: '2026-07-01',
          parties: 'IRS v. Example LLC',
        },
      ],
      clearCorporateAssociations: [
        {
          name: 'Example Holdings LLC',
          section: 'CorporateSection',
          reportKind: 'person',
        },
      ],
    });

    expect(html).toContain('Judgements');
    expect(html).toContain('Civil judgment');
    expect(html).toContain('CV-123');
    expect(html).toContain('Liens');
    expect(html).toContain('Federal tax lien');
    expect(html).toContain('Corporate filings');
    expect(html).toContain('Example Holdings LLC');
    expect(html).toContain('https://example.com/clear-person.pdf');
  });

  it('renders empty subsections when CLEAR metadata exists without records', () => {
    const html = buildClearReportSectionsHtml({});

    expect(html).toContain('Judgements');
    expect(html).toContain('Liens');
    expect(html).toContain('Corporate filings');
    expect(html.match(/>None</g)).toHaveLength(3);
  });

  it('does not add CLEAR subsections before CLEAR has run', () => {
    expect(buildClearReportSectionsHtml(undefined)).toBe('');
  });

  it('renders Application match rows when provided', () => {
    const html = buildClearReportSectionsHtml(
      {
        clearLienJudgments: [],
        clearCorporateAssociations: [],
      },
      [
        {
          kind: 'person',
          title: 'CRAIG S LINDER',
          subtitle: 'SSN 075-72-6326 · EIN 83-2513179 · 9fab7fea3e274250944af88effb51386',
          ownerLabel: 'Craig Linder',
          rows: [
            {
              label: 'First name',
              applicationValue: 'Craig',
              clearValue: 'CRAIG',
              status: 'match',
            },
            {
              label: 'Address',
              applicationValue: '4360 WADSWORTH RD, CALEDONIA, NY, 14423',
              clearValue: '782 LACEY RD, CALEDONIA, NY, 14423',
              status: 'mismatch',
            },
          ],
        },
      ],
    );

    expect(html).toContain('Application match');
    expect(html).toContain('CRAIG S LINDER');
    expect(html).toContain('App');
    expect(html).toContain('CLEAR');
    expect(html).toContain('Craig');
    expect(html).toContain('4360 WADSWORTH RD');
    expect(html).toContain('782 LACEY RD');
    expect(html).toContain('App:');
    expect(html).toContain('CLEAR:');
    expect(html).toContain('✓');
    expect(html).toContain('≠');
    expect(html).toContain('Judgements');
  });

  it('renders Application match alone when CLEAR metadata is missing', () => {
    const html = buildClearMatchSectionsHtml([
      {
        kind: 'business',
        title: 'Example LLC',
        subtitle: 'EIN 12-3456789',
        rows: [
          {
            label: 'Legal name',
            applicationValue: 'Example LLC',
            clearValue: 'Example LLC',
            status: 'match',
          },
        ],
      },
    ]);

    expect(html).toContain('Application match');
    expect(html).toContain('Example LLC');
    expect(
      buildClearReportSectionsHtml(undefined, [
        {
          kind: 'business',
          title: 'Example LLC',
          rows: [{ label: 'Legal name', applicationValue: 'A', clearValue: 'A', status: 'match' }],
        },
      ]),
    ).toContain('Application match');
  });
});
