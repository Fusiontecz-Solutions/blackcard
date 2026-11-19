// Address Type (nested in business and owner)
export interface Address {
    address1: string;
    address2: string;
    city: string;
    state: string;
    zipCode: string;
}

// Business Profile Type (matches backend schema)
export interface BusinessProfile {
    name: string;
    email: string;
    number: string;
    website: string;
    incorporationDate: string;
    incorporationState: string;
    businessEntityType: string;
    einNumber: string;
    annualRevenue?: number | string;
    monthlyRevenue: number | string;
    address: Address;
}

// Owner Detail Type (matches backend schema)
export interface OwnerDetail {
    firstName: string;
    middleName: string;
    lastName: string;
    email: string;
    mobileNumber: string;
    dateOfBirth: string;
    ssn: string;
    ficoScore: number | string;
    ownershipStartDate: string;
    ownershipPercentage: number | string;
    address: Address;
}

// Client Type (for API responses)
export interface Client {
    _id: string;
    clientId?: number;
    business: BusinessProfile;
    owner: OwnerDetail;
    owners?: OwnerDetail[];
    status?: 'Active' | 'Inactive' | 'Pending' | 'Archived';
    createdBy?: string;
    assignedTo?: string;
    notes?: string;
    createdAt?: string;
    updatedAt?: string;
}

// Create/Update Client Payload
export interface CreateClientPayload {
    business: BusinessProfile;
    owner?: OwnerDetail;
    owners: OwnerDetail[];
}

/** Partial client update — omit `owners` unless replacing the full owner list. */
export type ClientUpdatePayload = {
    business?: Partial<BusinessProfile> & { address?: Partial<Address> };
    owner?: Partial<OwnerDetail> & { address?: Partial<Address> };
    owners?: OwnerDetail[];
    status?: Client['status'];
    notes?: string;
    assignedTo?: string;
};

export interface UpdateClientPayload {
    id: string;
    data: CreateClientPayload | ClientUpdatePayload;
}

// API Response Types
export interface ClientResponse {
    success: boolean;
    message: string;
    data: Client;
}

export interface ClientsListResponse {
    success: boolean;
    message: string;
    data: Client[];
    pagination?: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
}

export interface DeleteClientResponse {
    success: boolean;
    message: string;
}
