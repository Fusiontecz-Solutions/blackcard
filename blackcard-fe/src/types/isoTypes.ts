export type IsoDocumentCategory = 'w9' | 'supporting' | 'other';

export interface IsoDocumentItem {
  id: string;
  url: string;
  originalName: string;
  publicId?: string | null;
  uploadedAt: string;
  /** Stored on ISO.documents in DB; drives W-9 vs supporting lists in the portal. */
  category?: IsoDocumentCategory;
}

export interface Iso {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  bankAccountNo: string;
  routingNumber: string;
  commissionPercentage: number;
  documents?: IsoDocumentItem[] | null;
  /** ISO agreement accepted in portal (persisted). */
  agreementAcceptedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateIsoPayload {
  name: string;
  email?: string | null;
  phone?: string | null;
  bankAccountNo: string;
  routingNumber: string;
  commissionPercentage: number;
}

export interface UpdateIsoPayload {
  name?: string;
  email?: string | null;
  phone?: string | null;
  bankAccountNo?: string;
  routingNumber?: string;
  commissionPercentage?: number;
  documents?: IsoDocumentItem[];
  agreementAcceptedAt?: string | null;
}
