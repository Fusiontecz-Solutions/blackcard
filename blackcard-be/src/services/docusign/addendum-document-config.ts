export const ADDENDUM_DOCUMENT_CONFIG: Record<string, {
  documentId: string;
  pageNumber: string;
  signHere: { x: string; y: string; pageNumber?: string }[];
  dateTabs: { x: string; y: string; pageNumber?: string }[];
  textTabs: { tabLabel: string; x: string; y: string; pageNumber?: string }[];
  initialHereTabs?: { x: string; y: string; pageNumber?: string }[];
  // Add other fields as needed
}> = {
  
  guarantorAddendum: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      { x: '118', y: '297', pageNumber: '1' }, 
      { x: '134', y: '460', pageNumber: '1' }, 
      { x: '118', y: '624', pageNumber: '1' }, 
    ],
    dateTabs: [
      { x: '272', y: '105', pageNumber: '1' },
      { x: '188', y: '117', pageNumber: '1' },
    ],
    textTabs: [
      { tabLabel: 'merchantBusinessName1', x: '205', y: '209', pageNumber: '1' },
      { tabLabel: 'dba1', x: '115', y: '229', pageNumber: '1' },
      { tabLabel: 'typeOfEntity1', x: '156', y: '245', pageNumber: '1' },
      { tabLabel: 'merchantBusinessEmail1', x: '169', y: '264', pageNumber: '4' },
      { tabLabel: 'einNumber1', x: '433', y: '244', pageNumber: '1' },
      { tabLabel: 'state1', x: '431', y: '265', pageNumber: '1' },
      { tabLabel: 'city1', x: '322', y: '267', pageNumber: '1' },
      { tabLabel: 'zip1', x: '492', y: '265', pageNumber: '1' },

      { tabLabel: 'merchantBusinessName2', x: '209', y: '376', pageNumber: '1' },
      { tabLabel: 'dba2', x: '124', y: '394', pageNumber: '1' },
      { tabLabel: 'typeOfEntity2', x: '159', y: '414', pageNumber: '1' },
      { tabLabel: 'merchantBusinessEmail2', x: '169', y: '428', pageNumber: '4' },
      { tabLabel: 'einNumber2', x: '438', y: '411', pageNumber: '1' },
      { tabLabel: 'state2', x: '430', y: '430', pageNumber: '1' },
      { tabLabel: 'city2', x: '324', y: '431', pageNumber: '1' },
      { tabLabel: 'zip2', x: '488', y: '431', pageNumber: '1' },

      { tabLabel: 'merchantBusinessName3', x: '212', y: '541', pageNumber: '1' },
      { tabLabel: 'dba3', x: '121', y: '561', pageNumber: '1' },
      { tabLabel: 'typeOfEntity3', x: '162', y: '579', pageNumber: '1' },
      { tabLabel: 'merchantBusinessEmail3', x: '169', y: '597', pageNumber: '4' },
      { tabLabel: 'einNumber3', x: '452', y: '578', pageNumber: '1' },
      { tabLabel: 'state3', x: '432', y: '597', pageNumber: '1' },
      { tabLabel: 'city3', x: '325', y: '599', pageNumber: '1' },
      { tabLabel: 'zip3', x: '496', y: '598', pageNumber: '1' },

      { tabLabel: 'merchantBusinessName1', x: '131', y: '328', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName2', x: '129', y: '496', pageNumber: '1' },
      { tabLabel: 'merchantBusinessName3', x: '126', y: '656', pageNumber: '1' },
      
    ],
  },
}; 