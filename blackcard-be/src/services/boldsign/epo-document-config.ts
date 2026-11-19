import type { DocumentFieldConfig } from './state-document-config';

export const EPO_DOCUMENT_CONFIG: Record<string, DocumentFieldConfig> = {

  epo: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '410', y: '441', pageNumber: '1' },
      { x: '410', y: '535', pageNumber: '1' },
    ],
    dateTabs: [
      { x: '262', y: '123', pageNumber: '1' },
      { x: '322', y: '138', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'merchantBusinessName1', x: '293', y: '156', pageNumber: '1' },
      { tabLabel: 'earlyPayoffAmount1', x: '94', y: '337', pageNumber: '1' },
      { tabLabel: 'earlyPayoffAmount2', x: '95', y: '351', pageNumber: '1' },
      { tabLabel: 'earlyPayoffAmount3', x: '95', y: '363', pageNumber: '1' },
      { tabLabel: 'earlyPayoffDate1', x: '312', y: '335', pageNumber: '1' },
      { tabLabel: 'earlyPayoffDate2', x: '318', y: '348', pageNumber: '1' },
      { tabLabel: 'earlyPayoffDate3', x: '318', y: '362', pageNumber: '1' },
      { tabLabel: 'merchantName1', x: '99', y: '452', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName2', x: '101', y: '552', pageNumber: '1' },
    ],
  },
};
