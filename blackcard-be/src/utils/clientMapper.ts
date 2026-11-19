export type OwnerInput = {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    email?: string;
    mobileNumber?: string;
    dateOfBirth?: string | Date | null;
    ssn?: string;
    ficoScore?: number | string | null;
    ownershipStartDate?: string | Date | null;
    ownershipPercentage?: number | string | null;
    address?: {
        address1?: string;
        address2?: string;
        city?: string;
        state?: string;
        zipCode?: string;
    };
};

const mapOwnerRecordToApi = (owner: any) => ({
    _id: owner.id,
    id: owner.id,
    firstName: owner.firstName ?? '',
    middleName: owner.middleName || '',
    lastName: owner.lastName ?? '',
    email: owner.email || '',
    mobileNumber: owner.mobileNumber || '',
    dateOfBirth: owner.dateOfBirth ?? null,
    ssn: owner.ssn || '',
    ficoScore: owner.ficoScore ?? undefined,
    ownershipStartDate: owner.ownershipStartDate ?? null,
    ownershipPercentage: owner.ownershipPercentage ?? undefined,
    address: {
        address1: owner.address1 || owner.address?.address1 || '',
        address2: owner.address2 || owner.address?.address2 || '',
        city: owner.city || owner.address?.city || '',
        state: owner.state || owner.address?.state || '',
        zipCode: owner.zipCode || owner.address?.zipCode || '',
    },
});

export const mapFlatClientOwnerToApi = (client: any) =>
    mapOwnerRecordToApi({
        firstName: client.ownerFirstName,
        middleName: client.ownerMiddleName,
        lastName: client.ownerLastName,
        email: client.ownerEmail,
        mobileNumber: client.ownerMobileNumber,
        dateOfBirth: client.ownerDateOfBirth,
        ssn: client.ownerSsn,
        ficoScore: client.ownerFicoScore,
        ownershipStartDate: client.ownerOwnershipStartDate,
        ownershipPercentage: client.ownerOwnershipPercentage,
        address1: client.ownerAddress1,
        address2: client.ownerAddress2,
        city: client.ownerCity,
        state: client.ownerState,
        zipCode: client.ownerZipCode,
    });

export const resolveClientOwners = (client: any) => {
    const relatedOwners = Array.isArray(client.owners)
        ? [...client.owners].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        : [];

    if (relatedOwners.length > 0) {
        return relatedOwners.map(mapOwnerRecordToApi);
    }

    if (client.ownerFirstName) {
        return [mapFlatClientOwnerToApi(client)];
    }

    return [];
};

export const mapClientToApi = (client: any) => {
    if (!client) return client;

    const {
        id,
        clientId,
        status,
        notes,
        createdAt,
        updatedAt,
        createdBy,
        assignedTo,
        businessName,
        businessEmail,
        businessNumber,
        businessWebsite,
        businessIncorporationDate,
        businessIncorporationState,
        businessEntityType,
        businessEinNumber,
        businessAnnualRevenue,
        businessMonthlyRevenue,
        businessAddress1,
        businessAddress2,
        businessCity,
        businessState,
        businessZipCode,
        owners: _owners,
        ownerFirstName: _ownerFirstName,
        ownerMiddleName: _ownerMiddleName,
        ownerLastName: _ownerLastName,
        ownerEmail: _ownerEmail,
        ownerMobileNumber: _ownerMobileNumber,
        ownerDateOfBirth: _ownerDateOfBirth,
        ownerSsn: _ownerSsn,
        ownerFicoScore: _ownerFicoScore,
        ownerOwnershipStartDate: _ownerOwnershipStartDate,
        ownerOwnershipPercentage: _ownerOwnershipPercentage,
        ownerAddress1: _ownerAddress1,
        ownerAddress2: _ownerAddress2,
        ownerCity: _ownerCity,
        ownerState: _ownerState,
        ownerZipCode: _ownerZipCode,
        ...rest
    } = client;

    const owners = resolveClientOwners(client);
    const primaryOwner = owners[0] ?? mapFlatClientOwnerToApi(client);

    return {
        ...rest,
        _id: id,
        id,
        clientId,
        status,
        notes,
        createdAt,
        updatedAt,
        business: {
            name: businessName,
            email: businessEmail || '',
            number: businessNumber || '',
            website: businessWebsite || '',
            incorporationDate: businessIncorporationDate,
            incorporationState: businessIncorporationState || '',
            businessEntityType: businessEntityType || '',
            einNumber: businessEinNumber || '',
            annualRevenue: businessAnnualRevenue ?? undefined,
            monthlyRevenue: businessMonthlyRevenue ?? undefined,
            address: {
                address1: businessAddress1 || '',
                address2: businessAddress2 || '',
                city: businessCity || '',
                state: businessState || '',
                zipCode: businessZipCode || '',
            },
        },
        owner: primaryOwner,
        owners,
        createdBy: createdBy
            ? {
                  _id: createdBy.id,
                  id: createdBy.id,
                  firstName: createdBy.firstName,
                  lastName: createdBy.lastName,
                  email: createdBy.email,
              }
            : undefined,
        assignedTo: assignedTo
            ? {
                  _id: assignedTo.id,
                  id: assignedTo.id,
                  firstName: assignedTo.firstName,
                  lastName: assignedTo.lastName,
                  email: assignedTo.email,
              }
            : undefined,
    };
};

/** True when the request body includes an explicit `owners` array (even if empty). */
export const hasExplicitOwnersArray = (body: { owners?: OwnerInput[] }): boolean =>
    Object.prototype.hasOwnProperty.call(body, 'owners') && Array.isArray(body.owners);

/** Owners array for update — only when `owners` was sent explicitly on the body. */
export const normalizeOwnersInput = (body: { owners?: OwnerInput[] }): OwnerInput[] => {
    if (hasExplicitOwnersArray(body) && body.owners!.length > 0) {
        return body.owners!;
    }
    return [];
};

/** Primary owner patch when the body sends `owner` without an explicit `owners` array. */
export const normalizeOwnerOnlyInput = (body: {
    owners?: OwnerInput[];
    owner?: OwnerInput;
}): OwnerInput | null => {
    if (hasExplicitOwnersArray(body)) return null;
    return body.owner ?? null;
};

/** Create accepts either `owners` or a legacy single `owner`. */
export const resolveOwnersForCreate = (body: {
    owners?: OwnerInput[];
    owner?: OwnerInput;
}): OwnerInput[] => {
    const owners = normalizeOwnersInput(body);
    if (owners.length > 0) return owners;
    if (body.owner) return [body.owner];
    return [];
};

export const buildOwnerAddress = (owner: OwnerInput) => ({
    address1: owner.address?.address1 || '',
    address2: owner.address?.address2 || '',
    city: owner.address?.city || '',
    state: owner.address?.state || '',
    zipCode: owner.address?.zipCode || '',
});

export const buildOwnerCreateData = (owner: OwnerInput, sortOrder: number) => {
    const ownerAddress = buildOwnerAddress(owner);

    return {
        sortOrder,
        firstName: owner.firstName || '',
        middleName: owner.middleName || null,
        lastName: owner.lastName || '',
        email: owner.email || null,
        mobileNumber: owner.mobileNumber || null,
        dateOfBirth: owner.dateOfBirth ? new Date(owner.dateOfBirth) : null,
        ssn: owner.ssn ? String(owner.ssn).trim() : null,
        ficoScore: owner.ficoScore != null && owner.ficoScore !== '' ? Number(owner.ficoScore) : null,
        ownershipStartDate: owner.ownershipStartDate ? new Date(owner.ownershipStartDate) : null,
        ownershipPercentage:
            owner.ownershipPercentage != null && owner.ownershipPercentage !== ''
                ? Number(owner.ownershipPercentage)
                : null,
        address1: ownerAddress.address1 || null,
        address2: ownerAddress.address2 || null,
        city: ownerAddress.city || null,
        state: ownerAddress.state || null,
        zipCode: ownerAddress.zipCode || null,
    };
};

export const buildPrimaryOwnerFlatFields = (owner: OwnerInput) => {
    const ownerData = buildOwnerCreateData(owner, 0);

    return {
        ownerFirstName: ownerData.firstName,
        ownerMiddleName: ownerData.middleName,
        ownerLastName: ownerData.lastName,
        ownerEmail: ownerData.email,
        ownerMobileNumber: ownerData.mobileNumber,
        ownerDateOfBirth: ownerData.dateOfBirth,
        ownerSsn: ownerData.ssn,
        ownerFicoScore: ownerData.ficoScore,
        ownerOwnershipStartDate: ownerData.ownershipStartDate,
        ownerOwnershipPercentage: ownerData.ownershipPercentage,
        ownerAddress1: ownerData.address1,
        ownerAddress2: ownerData.address2,
        ownerCity: ownerData.city,
        ownerState: ownerData.state,
        ownerZipCode: ownerData.zipCode,
    };
};
