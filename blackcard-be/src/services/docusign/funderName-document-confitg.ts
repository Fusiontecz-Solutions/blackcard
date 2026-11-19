export const FUNDERNAME_DOCUMENT_CONFIG: Record<string, {
  documentId: string;
  pageNumber: string;
  signHere: { x: string; y: string; pageNumber?: string }[];
  dateTabs: { x: string; y: string; pageNumber?: string }[];
  textTabs: { tabLabel: string; x: string; y: string; pageNumber?: string }[];
  initialHereTabs?: { x: string; y: string; pageNumber?: string }[];
  // Add other fields as needed
}> = {

  DAILYCOREFUNDING: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      // { x: '274', y: '467', pageNumber: '11' },
      { x: '427', y: '188', pageNumber: '12' },
      { x: '431', y: '302', pageNumber: '12' },
      // { x: '230', y: '405', pageNumber: '12' },
      { x: '469', y: '455', pageNumber: '16' },
      { x: '450', y: '628', pageNumber: '16' },
      { x: '41', y: '596', pageNumber: '17' },
      { x: '328', y: '595', pageNumber: '17' },
      // { x: '206', y: '180', pageNumber: '18' },
      { x: '408', y: '282', pageNumber: '19' },
      { x: '442', y: '378', pageNumber: '19' },
      { x: '218', y: '496', pageNumber: '20' },
      { x: '218', y: '496', pageNumber: '21' },

      { x: '113', y: '380', pageNumber: '24' },
      { x: '220', y: '270', pageNumber: '24' },
    ],
    dateTabs: [
      { x: '201', y: '168', pageNumber: '1' },
      
      { x: '408', y: '98', pageNumber: '13' },//doubt
      { x: '244', y: '111', pageNumber: '13' },//doubt
      { x: '63', y: '654', pageNumber: '17' },
      { x: '348', y: '655', pageNumber: '17' },
      { x: '279', y: '153', pageNumber: '18' },
      { x: '145', y: '205', pageNumber: '19' },
      { x: '106', y: '491', pageNumber: '20' },      
      { x: '109', y: '486', pageNumber: '21' },      
      { x: '341', y: '97', pageNumber: '22' },
      { x: '176', y: '258', pageNumber: '22' },
    ],
    textTabs: [
      { tabLabel: 'merchantBusinessName1', x: '152', y: '192', pageNumber: '1' },
      { tabLabel: 'dba1', x: '80', y: '202', pageNumber: '1' },
      { tabLabel: 'typeOfEntity1', x: '108', y: '214', pageNumber: '1' },
      { tabLabel: 'einNumber1', x: '408', y: '203', pageNumber: '1' },
      { tabLabel: 'merchantBusinessAddress1', x: '122', y: '225', pageNumber: '1' },
      { tabLabel: 'merchantContactAddress1', x: '120', y: '236', pageNumber: '1' },
      { tabLabel: 'merchantBusinessEmail1', x: '110', y: '248', pageNumber: '1' },
      { tabLabel: 'merchantstate', x: '463', y: '225', pageNumber: '1' },
      { tabLabel: 'contactstate', x: '466', y: '238', pageNumber: '1' },

      { tabLabel: 'city', x: '346', y: '224', pageNumber: '1' },
      { tabLabel: 'contactcity', x: '350', y: '237', pageNumber: '1' },

      { tabLabel: 'zip', x: '523', y: '222', pageNumber: '1' },
      { tabLabel: 'contactzip', x: '523', y: '237', pageNumber: '1' },


      { tabLabel: 'purchasePrice', x: '454', y: '303', pageNumber: '1'  },
      { tabLabel: 'revenuePurchased', x: '454', y: '362', pageNumber: '1'  },
      { tabLabel: 'paymentTerms', x: '538', y: '419', pageNumber: '1'  },
      { tabLabel: 'NetFundProvided', x: '454', y: '468', pageNumber: '1'  },//doubt
      { tabLabel: 'NetFundProvided', x: '454', y: '573', pageNumber: '1'  },
      { tabLabel: 'estimatedPayment', x: '454', y: '609', pageNumber: '1'  },

      { tabLabel: 'originationFee', x: '89', y: '396', pageNumber: '2' },
      // { tabLabel: 'feesDeducted', x: '90', y: '579', pageNumber: '2' },
      { tabLabel: 'estimatedPayment', x: '40', y: '685', pageNumber: '2' },

      { tabLabel: 'merchantName1', x: '57', y: '208', pageNumber: '12' },
      { tabLabel: 'ssnNumber1', x: '65', y: '252', pageNumber: '12' },//ssn number
      { tabLabel: 'driverLicenceNumber1', x: '434', y: '259', pageNumber: '12' },

      { tabLabel: 'merchantName2', x: '62', y: '322', pageNumber: '12' },
      { tabLabel: 'ssnNumber2', x: '70', y: '366', pageNumber: '12' },//ssn number
      { tabLabel: 'driverLicenceNumber2', x: '432', y: '369', pageNumber: '12' },

      { tabLabel: 'merchantBusinessName1', x: '64', y: '141', pageNumber: '13' },

      { tabLabel: 'guarantorName', x: '147', y: '386', pageNumber: '16' },
      { tabLabel: 'guarantordriverLicenceNumber', x: '274', y: '422', pageNumber: '16' },
      { tabLabel: 'guarantorTypeOfEntity', x: '252', y: '399', pageNumber: '16' },
      { tabLabel: 'guarantorAddress', x: '119', y: '432', pageNumber: '16' },
      { tabLabel: 'guarantorSsn', x: '456', y: '409', pageNumber: '16' },
      { tabLabel: 'guarantorEmail', x: '113', y: '444', pageNumber: '16' },
      { tabLabel: 'guarantorstate', x: '460', y: '434', pageNumber: '16' },
      { tabLabel: 'guarantorcity', x: '352', y: '432', pageNumber: '16' },
      { tabLabel: 'guarantorzip', x: '524', y: '434', pageNumber: '16' },
      { tabLabel: 'guarantorName', x: '64', y: '476', pageNumber: '16' },

      {tabLabel: 'guarantorName2', x: '157', y: '552', pageNumber: '16' },
      { tabLabel: 'guarantorSsn2', x: '461', y: '583', pageNumber: '16' },
      { tabLabel: 'guarantordriverLicenceNumber2', x: '280', y: '593', pageNumber: '16' },
      { tabLabel: 'guarantorTypeOfEntity2', x: '248', y: '570', pageNumber: '16' },
      { tabLabel: 'guarantorAddress2', x: '117', y: '603', pageNumber: '16' },
      { tabLabel: 'guarantorEmail2', x: '110', y: '615', pageNumber: '16' },
      { tabLabel: 'guarantorstate2', x: '458', y: '606', pageNumber: '16' },
      { tabLabel: 'guarantorcity2', x: '346', y: '603', pageNumber: '16' },
      { tabLabel: 'guarantorzip2', x: '522', y: '605', pageNumber: '16' },
      { tabLabel: 'guarantorName2', x: '61', y: '649', pageNumber: '16' },

      { tabLabel: 'merchantBankName1', x: '125', y: '271', pageNumber: '17' },
      { tabLabel: 'merchantAccountHolderName1', x: '135', y: '295', pageNumber: '17' },
      { tabLabel: 'merchantAccountNumber1', x: '131', y: '324', pageNumber: '17' },
      { tabLabel: 'merchantRoutingNumber1', x: '418', y: '325', pageNumber: '17' },
      { tabLabel: 'merchantName1', x: '70', y: '632', pageNumber: '17' },
      { tabLabel: 'merchantName2', x: '362', y: '630', pageNumber: '17' },

      { tabLabel: 'merchantBusinessName1', x: '206', y: '180', pageNumber: '18' },
      
      { tabLabel: 'merchantName1', x: '97', y: '304', pageNumber: '19' },
      { tabLabel: 'merchantName2', x: '106', y: '398', pageNumber: '19' },

      { tabLabel: 'merchantBankName1', x: '218', y: '241', pageNumber: '20' },
      { tabLabel: 'merchantAccountHolderName1', x: '219', y: '258', pageNumber: '20' },
      { tabLabel: 'merchantAccountNumber1', x: '219', y: '273', pageNumber: '20' },
      { tabLabel: 'merchantRoutingNumber1', x: '221', y: '292', pageNumber: '20' },
      { tabLabel: 'estimatedPayment', x: '219', y: '346', pageNumber: '20' },
      { tabLabel: 'merchantName1', x: '224', y: '552', pageNumber: '20' },

      { tabLabel: 'merchantBankName1', x: '218', y: '241', pageNumber: '21' },
      { tabLabel: 'merchantAccountHolderName1', x: '219', y: '258', pageNumber: '21' },
      { tabLabel: 'merchantAccountNumber1', x: '219', y: '273', pageNumber: '21' },
      { tabLabel: 'merchantRoutingNumber1', x: '221', y: '292', pageNumber: '21' },
      { tabLabel: 'estimatedWeeklyPayment', x: '219', y: '346', pageNumber: '21' },
      { tabLabel: 'merchantName1', x: '224', y: '552', pageNumber: '21' },

      { tabLabel: 'merchantBusinessName1', x: '148', y: '147', pageNumber: '22' },
      { tabLabel: 'dba1', x: '327', y: '146', pageNumber: '22' },

      { tabLabel: 'paymentTerms', x: '252', y: '430', pageNumber: '23' },//dont know
      { tabLabel: 'increasedPercentage', x: '343', y: '429', pageNumber: '23' },//dont know

      { tabLabel: 'funderName', x: '113', y: '314', pageNumber: '24' },
      { tabLabel: 'merchantBusinessName1', x: '112', y: '420', pageNumber: '24' },//dont know
    ],
  },

  WEEKLYCOREFUNDING: {
    documentId: '1',
    pageNumber: '1',
    signHere: [
      // { x: '274', y: '467', pageNumber: '11' },
      { x: '427', y: '188', pageNumber: '12' },
      { x: '431', y: '302', pageNumber: '12' },
      // { x: '226', y: '408', pageNumber: '12' },
      { x: '469', y: '455', pageNumber: '16' },
      { x: '450', y: '628', pageNumber: '16' },
      { x: '41', y: '596', pageNumber: '17' },
      { x: '328', y: '595', pageNumber: '17' },
      // { x: '206', y: '180', pageNumber: '18' },
      { x: '408', y: '282', pageNumber: '19' },
      { x: '442', y: '378', pageNumber: '19' },
      { x: '224', y: '499', pageNumber: '20' },
      { x: '244', y: '499', pageNumber: '21' },
    ],
    dateTabs: [
      { x: '201', y: '168', pageNumber: '1' },
      
      { x: '408', y: '98', pageNumber: '13' },//doubt
      { x: '244', y: '111', pageNumber: '13' },//doubt
      { x: '63', y: '654', pageNumber: '17' },
      { x: '348', y: '655', pageNumber: '17' },
      { x: '279', y: '153', pageNumber: '18' },
      { x: '145', y: '205', pageNumber: '19' },
      { x: '106', y: '486', pageNumber: '20' },
      { x: '106', y: '486', pageNumber: '21' },
    ],
    textTabs: [
      { tabLabel: 'merchantBusinessName1', x: '152', y: '192', pageNumber: '1' },
      { tabLabel: 'dba1', x: '80', y: '202', pageNumber: '1' },
      { tabLabel: 'typeOfEntity1', x: '108', y: '214', pageNumber: '1' },
      { tabLabel: 'einNumber1', x: '408', y: '203', pageNumber: '1' },
      { tabLabel: 'merchantBusinessAddress1', x: '122', y: '225', pageNumber: '1' },
      { tabLabel: 'merchantContactAddress1', x: '120', y: '236', pageNumber: '1' },
      { tabLabel: 'merchantBusinessEmail1', x: '110', y: '248', pageNumber: '1' },
      { tabLabel: 'merchantstate', x: '463', y: '225', pageNumber: '1' },
      { tabLabel: 'contactstate', x: '466', y: '238', pageNumber: '1' },

      { tabLabel: 'city', x: '346', y: '224', pageNumber: '1' },
      { tabLabel: 'contactcity', x: '350', y: '237', pageNumber: '1' },

      { tabLabel: 'zip', x: '523', y: '222', pageNumber: '1' },
      { tabLabel: 'contactzip', x: '523', y: '237', pageNumber: '1' },


      { tabLabel: 'purchasePrice', x: '454', y: '303', pageNumber: '1'  },
      { tabLabel: 'revenuePurchased', x: '454', y: '362', pageNumber: '1'  },
      { tabLabel: 'paymentTerms', x: '538', y: '419', pageNumber: '1'  },
      { tabLabel: 'NetFundProvided', x: '454', y: '468', pageNumber: '1'  },//doubt
      { tabLabel: 'NetFundProvided', x: '454', y: '573', pageNumber: '1'  },
      { tabLabel: 'estimatedPayment', x: '454', y: '609', pageNumber: '1'  },

      { tabLabel: 'originationFee', x: '89', y: '396', pageNumber: '2' },
      // { tabLabel: 'feesDeducted', x: '90', y: '579', pageNumber: '2' },
      { tabLabel: 'estimatedPayment', x: '40', y: '685', pageNumber: '2' },

      { tabLabel: 'merchantName1', x: '57', y: '208', pageNumber: '12' },
      { tabLabel: 'ssnNumber1', x: '65', y: '252', pageNumber: '12' },//ssn number
      { tabLabel: 'driverLicenceNumber1', x: '434', y: '259', pageNumber: '12' },

      { tabLabel: 'merchantName2', x: '62', y: '322', pageNumber: '12' },
      { tabLabel: 'ssnNumber2', x: '70', y: '366', pageNumber: '12' },//ssn number
      { tabLabel: 'driverLicenceNumber2', x: '432', y: '369', pageNumber: '12' },

      { tabLabel: 'merchantBusinessName1', x: '64', y: '141', pageNumber: '13' },

      { tabLabel: 'guarantorName', x: '147', y: '386', pageNumber: '16' },
      { tabLabel: 'guarantordriverLicenceNumber', x: '274', y: '422', pageNumber: '16' },
      { tabLabel: 'guarantorTypeOfEntity', x: '252', y: '399', pageNumber: '16' },
      { tabLabel: 'guarantorAddress', x: '119', y: '432', pageNumber: '16' },
      { tabLabel: 'guarantorSsn', x: '456', y: '409', pageNumber: '16' },
      { tabLabel: 'guarantorEmail', x: '113', y: '444', pageNumber: '16' },
      { tabLabel: 'guarantorstate', x: '460', y: '434', pageNumber: '16' },
      { tabLabel: 'guarantorcity', x: '352', y: '432', pageNumber: '16' },
      { tabLabel: 'guarantorzip', x: '524', y: '434', pageNumber: '16' },
      { tabLabel: 'guarantorName', x: '64', y: '476', pageNumber: '16' },

      {tabLabel: 'guarantorName2', x: '157', y: '552', pageNumber: '16' },
      { tabLabel: 'guarantorSsn2', x: '461', y: '583', pageNumber: '16' },
      { tabLabel: 'guarantordriverLicenceNumber2', x: '280', y: '593', pageNumber: '16' },
      { tabLabel: 'guarantorTypeOfEntity2', x: '248', y: '570', pageNumber: '16' },
      { tabLabel: 'guarantorAddress2', x: '117', y: '603', pageNumber: '16' },
      { tabLabel: 'guarantorEmail2', x: '110', y: '615', pageNumber: '16' },
      { tabLabel: 'guarantorstate2', x: '458', y: '606', pageNumber: '16' },
      { tabLabel: 'guarantorcity2', x: '346', y: '603', pageNumber: '16' },
      { tabLabel: 'guarantorzip2', x: '522', y: '605', pageNumber: '16' },
      { tabLabel: 'guarantorName2', x: '61', y: '649', pageNumber: '16' },

      { tabLabel: 'merchantBankName1', x: '125', y: '271', pageNumber: '17' },
      { tabLabel: 'merchantAccountHolderName1', x: '135', y: '295', pageNumber: '17' },
      { tabLabel: 'merchantAccountNumber1', x: '131', y: '324', pageNumber: '17' },
      { tabLabel: 'merchantRoutingNumber1', x: '418', y: '325', pageNumber: '17' },
      { tabLabel: 'merchantName1', x: '70', y: '632', pageNumber: '17' },
      { tabLabel: 'merchantName2', x: '362', y: '630', pageNumber: '17' },

      { tabLabel: 'merchantBusinessName1', x: '206', y: '180', pageNumber: '18' },
      
      { tabLabel: 'merchantName1', x: '97', y: '304', pageNumber: '19' },
      { tabLabel: 'merchantName2', x: '106', y: '398', pageNumber: '19' },

      { tabLabel: 'merchantBankName1', x: '218', y: '241', pageNumber: '20' },
      { tabLabel: 'merchantAccountHolderName1', x: '219', y: '258', pageNumber: '20' },
      { tabLabel: 'merchantAccountNumber1', x: '219', y: '273', pageNumber: '20' },
      { tabLabel: 'merchantRoutingNumber1', x: '221', y: '292', pageNumber: '20' },
      { tabLabel: 'estimatedPayment', x: '219', y: '346', pageNumber: '20' },
      { tabLabel: 'merchantName1', x: '224', y: '552', pageNumber: '20' },

      { tabLabel: 'merchantBankName1', x: '218', y: '241', pageNumber: '21' },
      { tabLabel: 'merchantAccountHolderName1', x: '219', y: '258', pageNumber: '21' },
      { tabLabel: 'merchantAccountNumber1', x: '219', y: '273', pageNumber: '21' },
      { tabLabel: 'merchantRoutingNumber1', x: '221', y: '292', pageNumber: '21' },
      { tabLabel: 'estimatedDailyPayment', x: '219', y: '346', pageNumber: '21' },
      { tabLabel: 'merchantName1', x: '224', y: '552', pageNumber: '21' },
    ],
  },


}

