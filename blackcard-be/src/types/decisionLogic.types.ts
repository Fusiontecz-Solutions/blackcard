interface TransactionAnalysisSummary {
    typeName: string;
    typeCode: string;
    totalCount: number;
    totalAmount: number;
    recentCount: number;
    recentAmount: number;
    displayOrder: number;
    score: string;
    message: string;
    transactionInterval: number;
    numberOfMissingIntervals: number;
    mostRecentTransactionAmount: number;
    mostRecentTransactionDate: string;
    averageTransactionAmount: number;
  }
  
  interface TransactionSummary {
    transactionDate: string;
    amount: number;
    runningBalance: number;
    description: string;
    typeCodes: string;
    isRefresh: boolean;
    status: string;
    category: string;
  }
  
  interface AccountExpense {
    category: string;
    amount: number;
    percent: number;
  }
  
  export interface ReportDetail {
    requestCode: string;
    customerIdentifier: string;
    emailAddress: string;
    institutionName: string;
    accountName: string;
    routingNumberEntered: string;
    routingNumberReturned: string;
    accountType: string;
    accountNumberEntered: string;
    accountNumberFound: string;
    accountNumberConfidence: number;
    nameEntered: string;
    nameFound: string;
    nameConfidence: number;
    amountInput: number;
    availableBalance: number;
    averageBalance: number;
    averageBalanceRecent: number;
    isLoginValid: boolean;
    isVerified: boolean;
    asOfDate: string;
    activityStartDate: string;
    activityEndDate: string;
    totalCredits: number;
    totalDebits: number;
    currentBalance: number;
    isActivityAvailable: boolean;
    transactionAnalysisSummaries: object[];
    transactionSummaries: object[];
    processedStatus: number;
    isStarted: boolean;
    isCompleted: boolean;
    notes: string;
    status: number;
    statusText: string;
    statusCodeColor: string;
    lastRefreshErrorMessage: string;
    isError: boolean;
    errorMessage: string;
    isACHSupported: boolean;
    accountExpenses: object[];
    chartsId: number;
    additionalAPI: string;
    isRequestRefreshable: boolean;
  }
  