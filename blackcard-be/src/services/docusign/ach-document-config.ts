export const ACH_DOCUMENT_CONFIG: Record<string, {
  documentId: string;
  pageNumber: string;
  signHere: { x: string; y: string; pageNumber?: string }[];
  dateTabs: { x: string; y: string; pageNumber?: string }[];
  textTabs: { tabLabel: string; x: string; y: string; pageNumber?: string }[];
  initialHereTabs?: { x: string; y: string; pageNumber?: string }[];
  // Add other fields as needed
}> = {
  
  weeklyAch: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '221', y: '496', pageNumber: '1' }, 
      // { x: '162', y: '330', pageNumber: '1' }, 
    ],
    dateTabs: [
      { x: '106', y: '485', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'merchantBankName', x: '225', y: '243', pageNumber: '1' },
      { tabLabel: 'merchantAccountHolderName', x: '224', y: '258', pageNumber: '1' },
      { tabLabel: 'merchantAccountNumber', x: '221', y: '274', pageNumber: '1' },
      { tabLabel: 'merchantRoutingNumber', x: '223', y: '291', pageNumber: '1' },
      { tabLabel: 'paymentAmount', x: '231', y: '348', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName', x: '224', y: '551', pageNumber: '1' },
      { tabLabel: 'frequency', x: '234', y: '366', pageNumber: '1' },
    ],
  },

  dailyAch: {
    documentId: '1',
    pageNumber: '1',
     signHere: [
      { x: '221', y: '496', pageNumber: '1' }, 
      // { x: '162', y: '330', pageNumber: '1' }, 
    ],
    dateTabs: [
      { x: '106', y: '485', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'merchantBankName', x: '225', y: '243', pageNumber: '1' },
      { tabLabel: 'merchantAccountHolderName', x: '224', y: '258', pageNumber: '1' },
      { tabLabel: 'merchantAccountNumber', x: '221', y: '274', pageNumber: '1' },
      { tabLabel: 'merchantRoutingNumber', x: '223', y: '291', pageNumber: '1' },
      { tabLabel: 'purchasePrice', x: '231', y: '348', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName', x: '224', y: '551', pageNumber: '1' },
      { tabLabel: 'frequency', x: '234', y: '366', pageNumber: '1' },
    ],
  },
}; 