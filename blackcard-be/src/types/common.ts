export interface UserType {
    userId: string;
    role: string;
  }

/** User shape for JWT access tokens (subset of Prisma `User` + role). */
export type UserWithRole = {
    id: string;
    role?: { name?: string } | null;
};
  
  export interface PaginationOptions<TFilters = Record<string, any>> {
    page: number;
    size: number;
    query: string;
    sortBy: string;
    orderBy: "asc" | "desc";
    filters?: TFilters;
  }
  
  export interface QueryOptions<TFilters = Record<string, any>> {
    offset: number;
    size: number;
    query: string;
    sortBy: string;
    orderBy: "asc" | "desc";
    filters?: TFilters;
  }
  
  export interface FileMetadata {
    fileName: string;
    filePath: string;
    fileUrl: string;
    downloadUrl: string;
    contentType: string;
    size: number;
  }
  
  export interface EnvelopePayload {
    documentId: string;
    signers: {
      email: string;
      name: string;
      recipientId: string;
    }[];
    agents?: {
      email: string;
      name: string;
      recipientId: string;
    }[];
    documentName: string;
    fileExtension: string;
    emailSubject: string;
    envelopeType?: string;
    referenceId?: string;
    status: string;
  }
  
  export interface ReportDetailsParams {
    applicationId: string;
    requestCode: string;
  }
  
  export interface PrepaymentTermsData {
    startDay: number;
    endDay: number;
    buyRate: number;
    factorRate: number;
    approvedAmount: number;
    repaymentAmount: number;
    commissionPercent?: number;
    commissionAmount?: number;
    numberOfDays?: number;
  }
  
  // Define the PaymentTransaction interface manually
  export interface PaymentTransaction {
    id: number;
    status: string;
    orderId: number;
    historyId: number;
    consumerUnique: string;
    authCode: string;
    parentId: string;
    subId: string;
    paymentType: string;
    customerName: string;
    customerPhone: string;
    initialAmount: number;
    billingCycle: number;
    currency: string;
    merchantOrderNumber: string;
    customerId: number;
    applicationId: number;
    offerId: number;
    createdAt: Date;
    updatedAt: Date;
  }
  