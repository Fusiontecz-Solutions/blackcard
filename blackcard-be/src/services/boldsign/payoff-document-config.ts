import type { DocumentFieldConfig } from './state-document-config';

export const PAYOFF_DOCUMENT_CONFIG: Record<string, DocumentFieldConfig> = {

  Payoff1: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '152', y: '544', pageNumber: '1' },
    ],
    dateTabs: [
      { x: '116', y: '608', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'purchasePrice', x: '322', y: '299', pageNumber: '1' },
      { tabLabel: 'paidToPriorMca', x: '326', y: '328', pageNumber: '1' },
      { tabLabel: 'originationFee', x: '325', y: '364', pageNumber: '1' },
      { tabLabel: 'recipientFunds', x: '329', y: '396', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName1', x: '192', y: '482', pageNumber: '1' },
      { tabLabel: 'merchantName1', x: '230', y: '521', pageNumber: '1' },
    ],
  },

  Payoff2: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '159', y: '581', pageNumber: '1' },
    ],
    dateTabs: [
      { x: '128', y: '647', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'purchasePrice', x: '322', y: '299', pageNumber: '1' },
      { tabLabel: 'paidToPriorMca', x: '326', y: '328', pageNumber: '1' },
      { tabLabel: 'paidToThirdParty', x: '328', y: '366', pageNumber: '1' },
      { tabLabel: 'originationFee', x: '325', y: '405', pageNumber: '1' },
      { tabLabel: 'recipientFunds', x: '366', y: '430', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName1', x: '204', y: '521', pageNumber: '1' },
      { tabLabel: 'merchantName1', x: '242', y: '560', pageNumber: '1' },
    ],
  },

  Payoff3: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '154', y: '618', pageNumber: '1' },
    ],
    dateTabs: [
      { x: '121', y: '679', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'purchasePrice', x: '322', y: '299', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName1', x: '326', y: '328', pageNumber: '1' },
      { tabLabel: 'originationFee', x: '327', y: '445', pageNumber: '1' },
      { tabLabel: 'recipientFunds', x: '329', y: '475', pageNumber: '1' },
      { tabLabel: 'paidToPriorMca', x: '330', y: '369', pageNumber: '1' },
      { tabLabel: 'paidToThirdParty', x: '327', y: '414', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName1', x: '203', y: '554', pageNumber: '1' },
      { tabLabel: 'merchantName1', x: '222', y: '593', pageNumber: '1' },
    ],
  },
};
