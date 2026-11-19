import type { Request } from 'express';
import prisma from '../config/prismaClient';
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/errors';
import { createApplicationActivityLog } from './applicationActivityLogService';
import {
  getApplicationForUserByRef,
  getAuthenticatedUserFromRequest,
  type AuthenticatedUser,
} from './applicationService';
import {
  isClearBusinessSyncFieldKey,
  isClearPersonSyncFieldKey,
  normalizeClearEin,
  normalizeClearSsn,
  normalizeIncorporationDate,
  normalizeStateCode,
  parseUsAddressBlob,
  type ClearBusinessSyncFieldKey,
  type ClearPersonSyncFieldKey,
} from './clearComparison';

type ClearBusinessHitPayload = {
  groupId?: string;
  companyEntityId?: string;
  name?: string;
  fein?: string;
  address1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  addressBlob?: string;
};

type ClearPersonHitPayload = {
  groupId?: string;
  personEntityId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  ssn?: string;
  dateOfBirth?: string;
  email?: string;
  phoneNumber?: string;
  address1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  addressBlob?: string;
};

function optionalString(value: unknown): string {
  return String(value ?? '').trim();
}

function displayValue(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  return optionalString(value);
}

function parseBusinessFields(raw: unknown): ClearBusinessSyncFieldKey[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('fields must be a non-empty array');
  }
  const fields: ClearBusinessSyncFieldKey[] = [];
  for (const item of raw) {
    if (!isClearBusinessSyncFieldKey(item)) {
      throw new ValidationError(`Unsupported CLEAR business sync field: ${String(item)}`);
    }
    if (!fields.includes(item)) fields.push(item);
  }
  return fields;
}

function parsePersonFields(raw: unknown): ClearPersonSyncFieldKey[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('fields must be a non-empty array');
  }
  const fields: ClearPersonSyncFieldKey[] = [];
  for (const item of raw) {
    if (!isClearPersonSyncFieldKey(item)) {
      throw new ValidationError(`Unsupported CLEAR person sync field: ${String(item)}`);
    }
    if (!fields.includes(item)) fields.push(item);
  }
  return fields;
}

function normalizeBusinessHit(raw: unknown): ClearBusinessHitPayload {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('hit is required');
  }
  const row = raw as Record<string, unknown>;
  return {
    groupId: optionalString(row.groupId) || undefined,
    companyEntityId: optionalString(row.companyEntityId) || undefined,
    name: optionalString(row.name),
    fein: optionalString(row.fein),
    address1: optionalString(row.address1),
    city: optionalString(row.city),
    state: optionalString(row.state),
    zipCode: optionalString(row.zipCode),
    addressBlob: optionalString(row.addressBlob),
  };
}

function normalizePersonHit(raw: unknown): ClearPersonHitPayload {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError('hit is required');
  }
  const row = raw as Record<string, unknown>;
  return {
    groupId: optionalString(row.groupId) || undefined,
    personEntityId: optionalString(row.personEntityId) || undefined,
    firstName: optionalString(row.firstName),
    middleName: optionalString(row.middleName),
    lastName: optionalString(row.lastName),
    ssn: optionalString(row.ssn),
    dateOfBirth: optionalString(row.dateOfBirth),
    email: optionalString(row.email),
    phoneNumber: optionalString(row.phoneNumber),
    address1: optionalString(row.address1),
    city: optionalString(row.city),
    state: optionalString(row.state),
    zipCode: optionalString(row.zipCode),
    addressBlob: optionalString(row.addressBlob),
  };
}

function resolveBusinessAddress(hit: ClearBusinessHitPayload) {
  if (hit.address1 && hit.city && hit.state && hit.zipCode) {
    return {
      address1: hit.address1,
      city: hit.city,
      state: normalizeStateCode(hit.state) || hit.state,
      zipCode: hit.zipCode.replace(/\D/g, '').slice(0, 5) || hit.zipCode,
    };
  }
  return parseUsAddressBlob(hit.addressBlob || '');
}

function resolvePersonAddress(hit: ClearPersonHitPayload) {
  if (hit.address1 && hit.city && hit.state && hit.zipCode) {
    return {
      address1: hit.address1,
      city: hit.city,
      state: normalizeStateCode(hit.state) || hit.state,
      zipCode: hit.zipCode.replace(/\D/g, '').slice(0, 5) || hit.zipCode,
    };
  }
  return parseUsAddressBlob(hit.addressBlob || '');
}

async function resolveApplicationClient(
  applicationRef: string,
  user: AuthenticatedUser | null,
) {
  const { application, forbidden } = await getApplicationForUserByRef(applicationRef, user, {
    client: { include: { owners: true } },
  });

  if (forbidden) {
    throw new ForbiddenError('Forbidden: you do not have access to this application');
  }
  if (!application) {
    throw new NotFoundError('Application not found');
  }

  const clientId = String(
    (application as { clientId?: string | null }).clientId ??
      (application as { client?: { id?: string | null } | null }).client?.id ??
      '',
  ).trim();
  if (!clientId) {
    throw new ValidationError('Application has no linked client to sync');
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { owners: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!client) {
    throw new NotFoundError('Client not found');
  }

  return { application, client, clientId };
}

async function logClearSyncEvent(params: {
  applicationId: string;
  user: AuthenticatedUser | null;
  req?: Request | null;
  actionDescription: string;
  action: string;
  metadata: Record<string, unknown>;
}) {
  await createApplicationActivityLog({
    applicationId: params.applicationId,
    user: params.user,
    actionType: 'APPLICATION_UPDATED',
    actionDescription: params.actionDescription,
    req: params.req,
    metadata: {
      source: 'clear',
      ...params.metadata,
    },
  });

  const backgroundCheck = await (prisma as any).backgroundCheck.findUnique({
    where: { applicationId: params.applicationId },
    select: {
      id: true,
      items: {
        where: { checkType: 'TLO' },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (backgroundCheck?.id) {
    await (prisma as any).backgroundCheckEvent.create({
      data: {
        backgroundCheckId: backgroundCheck.id,
        itemId: backgroundCheck.items?.[0]?.id ?? null,
        action: params.action,
        detail: params.metadata,
        actorId: params.user?.id ?? null,
      },
    });
  }
}

export const clearService = {
  async syncBusinessToClient(
    applicationRef: string,
    body: unknown,
    user: AuthenticatedUser | null,
    req?: Request | null,
  ) {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid CLEAR business sync payload');
    }
    const payload = body as Record<string, unknown>;
    const hit = normalizeBusinessHit(payload.hit);
    const fields = parseBusinessFields(payload.fields);
    const { application, client, clientId } = await resolveApplicationClient(applicationRef, user);

    const parsedAddress = resolveBusinessAddress(hit);
    const wantsAddress = fields.some(
      (field) => field === 'address1' || field === 'city' || field === 'state' || field === 'zipCode',
    );
    if (wantsAddress && !parsedAddress) {
      throw new ValidationError(
        'CLEAR business address could not be confidently parsed into street, city, state, and ZIP',
      );
    }

    const updateData: Record<string, unknown> = {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const updatedFields: Record<string, string> = {};

    const setField = (
      key: ClearBusinessSyncFieldKey,
      clientKey: string,
      nextValue: string | null | undefined,
    ) => {
      const nextDisplay = displayValue(nextValue);
      if (!nextDisplay) return;
      before[key] = displayValue((client as any)[clientKey]);
      after[key] = nextDisplay;
      updatedFields[key] = nextDisplay;
      updateData[clientKey] = nextValue;
    };

    for (const field of fields) {
      switch (field) {
        case 'businessName':
          setField('businessName', 'businessName', hit.name);
          break;
        case 'businessEinNumber':
          setField('businessEinNumber', 'businessEinNumber', normalizeClearEin(hit.fein) || hit.fein);
          break;
        case 'address1':
          if (parsedAddress) setField('address1', 'businessAddress1', parsedAddress.address1);
          break;
        case 'city':
          if (parsedAddress) setField('city', 'businessCity', parsedAddress.city);
          break;
        case 'state':
          if (parsedAddress) setField('state', 'businessState', parsedAddress.state);
          break;
        case 'zipCode':
          if (parsedAddress) setField('zipCode', 'businessZipCode', parsedAddress.zipCode);
          break;
        default:
          break;
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No non-empty CLEAR business values available for the selected fields');
    }

    await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });

    await logClearSyncEvent({
      applicationId: application.id,
      user,
      req,
      actionDescription: 'Synced CLEAR business fields into application business profile',
      action: 'clear_synced_to_client',
      metadata: {
        groupId: hit.groupId,
        companyEntityId: hit.companyEntityId,
        businessName: hit.name,
        fields: Object.keys(updatedFields),
        before,
        after,
      },
    });

    return { clientId, updatedFields, before, after };
  },

  async syncPersonToOwner(
    applicationRef: string,
    body: unknown,
    user: AuthenticatedUser | null,
    req?: Request | null,
  ) {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid CLEAR person sync payload');
    }
    const payload = body as Record<string, unknown>;
    const hit = normalizePersonHit(payload.hit);
    const fields = parsePersonFields(payload.fields);
    const ownerId = optionalString(payload.ownerId);
    const { application, client, clientId } = await resolveApplicationClient(applicationRef, user);

    const parsedAddress = resolvePersonAddress(hit);
    const wantsAddress = fields.some(
      (field) => field === 'address1' || field === 'city' || field === 'state' || field === 'zipCode',
    );
    if (wantsAddress && !parsedAddress) {
      throw new ValidationError(
        'CLEAR person address could not be confidently parsed into street, city, state, and ZIP',
      );
    }

    const owners = Array.isArray(client.owners) ? client.owners : [];
    const owner = ownerId ? owners.find((row) => row.id === ownerId) : null;

    if (ownerId && !owner && owners.length > 0) {
      throw new NotFoundError('Owner not found on this application client');
    }

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const updatedFields: Record<string, string> = {};

    if (owner) {
      const updateData: Record<string, unknown> = {};
      const setOwnerField = (
        key: ClearPersonSyncFieldKey,
        ownerKey: string,
        nextValue: string | Date | null | undefined,
      ) => {
        const nextDisplay = displayValue(nextValue);
        if (!nextDisplay) return;
        before[key] = displayValue((owner as any)[ownerKey]);
        after[key] = nextDisplay;
        updatedFields[key] = nextDisplay;
        updateData[ownerKey] = nextValue;
      };

      for (const field of fields) {
        switch (field) {
          case 'firstName':
            setOwnerField('firstName', 'firstName', hit.firstName);
            break;
          case 'middleName':
            setOwnerField('middleName', 'middleName', hit.middleName);
            break;
          case 'lastName':
            setOwnerField('lastName', 'lastName', hit.lastName);
            break;
          case 'dateOfBirth': {
            const iso = normalizeIncorporationDate(hit.dateOfBirth);
            if (!iso) break;
            setOwnerField('dateOfBirth', 'dateOfBirth', new Date(`${iso}T00:00:00.000Z`));
            break;
          }
          case 'ssn':
            setOwnerField('ssn', 'ssn', normalizeClearSsn(hit.ssn) || hit.ssn);
            break;
          case 'email':
            setOwnerField('email', 'email', hit.email);
            break;
          case 'mobileNumber':
            setOwnerField('mobileNumber', 'mobileNumber', hit.phoneNumber);
            break;
          case 'address1':
            if (parsedAddress) setOwnerField('address1', 'address1', parsedAddress.address1);
            break;
          case 'city':
            if (parsedAddress) setOwnerField('city', 'city', parsedAddress.city);
            break;
          case 'state':
            if (parsedAddress) setOwnerField('state', 'state', parsedAddress.state);
            break;
          case 'zipCode':
            if (parsedAddress) setOwnerField('zipCode', 'zipCode', parsedAddress.zipCode);
            break;
          default:
            break;
        }
      }

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('No non-empty CLEAR person values available for the selected fields');
      }

      await prisma.clientOwner.update({
        where: { id: owner.id },
        data: updateData,
      });
    } else {
      // Legacy scalar primary-owner columns when no ClientOwner rows exist.
      const updateData: Record<string, unknown> = {};
      const setScalar = (
        key: ClearPersonSyncFieldKey,
        clientKey: string,
        nextValue: string | Date | null | undefined,
      ) => {
        const nextDisplay = displayValue(nextValue);
        if (!nextDisplay) return;
        before[key] = displayValue((client as any)[clientKey]);
        after[key] = nextDisplay;
        updatedFields[key] = nextDisplay;
        updateData[clientKey] = nextValue;
      };

      for (const field of fields) {
        switch (field) {
          case 'firstName':
            setScalar('firstName', 'ownerFirstName', hit.firstName);
            break;
          case 'middleName':
            setScalar('middleName', 'ownerMiddleName', hit.middleName);
            break;
          case 'lastName':
            setScalar('lastName', 'ownerLastName', hit.lastName);
            break;
          case 'dateOfBirth': {
            const iso = normalizeIncorporationDate(hit.dateOfBirth);
            if (!iso) break;
            setScalar('dateOfBirth', 'ownerDateOfBirth', new Date(`${iso}T00:00:00.000Z`));
            break;
          }
          case 'ssn':
            setScalar('ssn', 'ownerSsn', normalizeClearSsn(hit.ssn) || hit.ssn);
            break;
          case 'email':
            setScalar('email', 'ownerEmail', hit.email);
            break;
          case 'mobileNumber':
            setScalar('mobileNumber', 'ownerMobileNumber', hit.phoneNumber);
            break;
          case 'address1':
            if (parsedAddress) setScalar('address1', 'ownerAddress1', parsedAddress.address1);
            break;
          case 'city':
            if (parsedAddress) setScalar('city', 'ownerCity', parsedAddress.city);
            break;
          case 'state':
            if (parsedAddress) setScalar('state', 'ownerState', parsedAddress.state);
            break;
          case 'zipCode':
            if (parsedAddress) setScalar('zipCode', 'ownerZipCode', parsedAddress.zipCode);
            break;
          default:
            break;
        }
      }

      if (Object.keys(updateData).length === 0) {
        throw new ValidationError('No non-empty CLEAR person values available for the selected fields');
      }

      await prisma.client.update({
        where: { id: clientId },
        data: updateData,
      });
    }

    await logClearSyncEvent({
      applicationId: application.id,
      user,
      req,
      actionDescription: 'Synced CLEAR person fields into application owner profile',
      action: 'clear_synced_to_owner',
      metadata: {
        ownerId: owner?.id ?? null,
        usedScalarOwner: !owner,
        groupId: hit.groupId,
        personEntityId: hit.personEntityId,
        fields: Object.keys(updatedFields),
        before,
        after,
      },
    });

    return {
      clientId,
      ownerId: owner?.id ?? null,
      updatedFields,
      before,
      after,
    };
  },

  getAuthenticatedUser(req: Request): AuthenticatedUser | null {
    return getAuthenticatedUserFromRequest(req);
  },
};
