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
  isOpenCorporatesSyncFieldKey,
  normalizeIncorporationDate,
  normalizeStateCode,
  parseUsAddressBlob,
  type OpenCorporatesSyncFieldKey,
} from './opencorporatesComparison';

export type OpenCorporatesOfficer = {
  name: string;
  position?: string;
  status?: 'active' | 'inactive';
};

export type OpenCorporatesAddress = {
  label: string;
  address: string;
};

export type OpenCorporatesIdentifier = {
  system: string;
  value: string;
  category?: string;
};

export type OpenCorporatesCompanyHit = {
  name: string;
  companyNumber: string;
  jurisdictionCode: string;
  currentStatus?: string;
  incorporationDate?: string;
  registeredAddress?: string;
  headOfficeAddress?: string;
  mailingAddress?: string;
  agentName?: string;
  agentAddress?: string;
  addresses?: OpenCorporatesAddress[];
  companyType?: string;
  opencorporatesUrl: string;
  registryUrl?: string;
  officers?: OpenCorporatesOfficer[];
  inactiveOfficers?: OpenCorporatesOfficer[];
  identifiers?: OpenCorporatesIdentifier[];
  dataSource?: string;
  lastUpdateFromSource?: string;
  lastChangeRecorded?: string;
  nextUpdateFromSource?: string;
};

export type OpenCorporatesLookupData = {
  searchQuery: string;
  jurisdictionCode?: string;
  companies: OpenCorporatesCompanyHit[];
  sourceUrl?: string;
  searchedAt: string;
};

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

function normalizeOfficers(raw: unknown): OpenCorporatesOfficer[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const officers = raw
    .map((officer) => {
      if (!officer || typeof officer !== 'object') return null;
      const row = officer as Record<string, unknown>;
      const name = String(row.name ?? '').trim();
      if (!name) return null;
      const position = String(row.position ?? '').trim();
      const status = String(row.status ?? '').trim();
      return {
        name,
        ...(position ? { position } : {}),
        ...(status === 'active' || status === 'inactive' ? { status } : {}),
      };
    })
    .filter((officer): officer is OpenCorporatesOfficer => officer != null);
  return officers.length > 0 ? officers : undefined;
}

function normalizeAddresses(raw: unknown): OpenCorporatesAddress[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const addresses = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const label = String(row.label ?? '').trim();
      const address = String(row.address ?? '').trim();
      if (!label || !address) return null;
      return { label, address };
    })
    .filter((entry): entry is OpenCorporatesAddress => entry != null);
  return addresses.length > 0 ? addresses : undefined;
}

function normalizeIdentifiers(raw: unknown): OpenCorporatesIdentifier[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const identifiers = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const system = String(row.system ?? '').trim();
      const value = String(row.value ?? '').trim();
      if (!system || !value) return null;
      const category = String(row.category ?? '').trim();
      return {
        system,
        value,
        ...(category ? { category } : {}),
      };
    })
    .filter((entry): entry is OpenCorporatesIdentifier => entry != null);
  return identifiers.length > 0 ? identifiers : undefined;
}

function normalizeCompanyHit(raw: unknown, index: number): OpenCorporatesCompanyHit {
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError(`companies[${index}] must be an object`);
  }
  const item = raw as Record<string, unknown>;
  const name = String(item.name ?? '').trim();
  const companyNumber = String(item.companyNumber ?? '').trim();
  const jurisdictionCode = String(item.jurisdictionCode ?? '').trim().toLowerCase();
  const opencorporatesUrl = String(item.opencorporatesUrl ?? '').trim();

  if (!name || !companyNumber || !jurisdictionCode || !opencorporatesUrl) {
    throw new ValidationError(
      `companies[${index}] requires name, companyNumber, jurisdictionCode, and opencorporatesUrl`,
    );
  }

  const officers = normalizeOfficers(item.officers);
  const inactiveOfficers = normalizeOfficers(item.inactiveOfficers);
  const addresses = normalizeAddresses(item.addresses);
  const identifiers = normalizeIdentifiers(item.identifiers);

  return {
    name,
    companyNumber,
    jurisdictionCode,
    currentStatus: optionalString(item.currentStatus),
    incorporationDate: optionalString(item.incorporationDate),
    registeredAddress: optionalString(item.registeredAddress),
    headOfficeAddress: optionalString(item.headOfficeAddress),
    mailingAddress: optionalString(item.mailingAddress),
    agentName: optionalString(item.agentName),
    agentAddress: optionalString(item.agentAddress),
    companyType: optionalString(item.companyType),
    opencorporatesUrl,
    registryUrl: optionalString(item.registryUrl),
    dataSource: optionalString(item.dataSource),
    lastUpdateFromSource: optionalString(item.lastUpdateFromSource),
    lastChangeRecorded: optionalString(item.lastChangeRecorded),
    nextUpdateFromSource: optionalString(item.nextUpdateFromSource),
    ...(addresses ? { addresses } : {}),
    ...(officers ? { officers } : {}),
    ...(inactiveOfficers ? { inactiveOfficers } : {}),
    ...(identifiers ? { identifiers } : {}),
  };
}

async function assertApplicationExists(applicationId: string): Promise<void> {
  const id = String(applicationId ?? '').trim();
  if (!id) {
    throw new ValidationError('applicationId is required');
  }

  const application = await prisma.application.findFirst({
    where: {
      OR: [
        { id },
        ...(Number.isFinite(Number(id)) ? [{ applicationId: Number(id) }] : []),
        { dealId: id },
      ],
    },
    select: { id: true },
  });

  if (!application) {
    throw new NotFoundError('Application not found');
  }
}

function pickOpenCorporatesAddressBlob(company: OpenCorporatesCompanyHit): string {
  const labeled =
    company.addresses?.find((entry) =>
      /registered|principal|head office|business/i.test(entry.label),
    )?.address ?? company.addresses?.[0]?.address;
  return String(
    labeled ||
      company.registeredAddress ||
      company.headOfficeAddress ||
      company.mailingAddress ||
      '',
  ).trim();
}

function parseSyncFields(raw: unknown): OpenCorporatesSyncFieldKey[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('fields must be a non-empty array');
  }
  const fields: OpenCorporatesSyncFieldKey[] = [];
  for (const item of raw) {
    if (!isOpenCorporatesSyncFieldKey(item)) {
      throw new ValidationError(`Unsupported sync field: ${String(item)}`);
    }
    if (!fields.includes(item)) fields.push(item);
  }
  return fields;
}

function displayValue(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  }
  return String(value ?? '').trim();
}

export const opencorporatesService = {
  normalizeImportPayload(body: unknown): {
    searchQuery: string;
    jurisdictionCode?: string;
    sourceUrl?: string;
    companies: OpenCorporatesCompanyHit[];
  } {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid OpenCorporates import payload');
    }
    const payload = body as Record<string, unknown>;
    const searchQuery = String(payload.searchQuery ?? '').trim();
    if (!searchQuery) {
      throw new ValidationError('searchQuery is required');
    }
    if (!Array.isArray(payload.companies)) {
      throw new ValidationError('companies must be an array');
    }

    return {
      searchQuery,
      jurisdictionCode: String(payload.jurisdictionCode ?? '').trim() || undefined,
      sourceUrl: String(payload.sourceUrl ?? '').trim() || undefined,
      companies: payload.companies.map((company, index) => normalizeCompanyHit(company, index)),
    };
  },

  async importForApplication(
    applicationId: string,
    body: unknown,
  ): Promise<OpenCorporatesLookupData> {
    const normalized = this.normalizeImportPayload(body);
    await assertApplicationExists(applicationId);

    return {
      searchQuery: normalized.searchQuery,
      jurisdictionCode: normalized.jurisdictionCode,
      sourceUrl: normalized.sourceUrl,
      companies: normalized.companies,
      searchedAt: new Date().toISOString(),
    };
  },

  async syncToClient(
    applicationRef: string,
    body: unknown,
    user: AuthenticatedUser | null,
    req?: Request | null,
  ): Promise<{
    clientId: string;
    updatedFields: Record<string, string>;
    before: Record<string, string>;
    after: Record<string, string>;
  }> {
    if (!body || typeof body !== 'object') {
      throw new ValidationError('Invalid OpenCorporates sync payload');
    }
    const payload = body as Record<string, unknown>;
    const company = normalizeCompanyHit(payload.company, 0);
    const fields = parseSyncFields(payload.fields);

    const { application, forbidden } = await getApplicationForUserByRef(applicationRef, user, {
      client: true,
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

    const client = await prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundError('Client not found');
    }

    const parsedAddress = parseUsAddressBlob(pickOpenCorporatesAddressBlob(company));
    const wantsAddress = fields.some((field) =>
      ['address1', 'city', 'state', 'zipCode'].includes(field),
    );
    if (wantsAddress && !parsedAddress) {
      throw new ValidationError(
        'Registered address could not be confidently parsed into street, city, state, and ZIP',
      );
    }

    const updateData: Record<string, unknown> = {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const updatedFields: Record<string, string> = {};

    const setField = (
      key: OpenCorporatesSyncFieldKey,
      clientKey: string,
      nextValue: string | Date | null | undefined,
    ) => {
      if (nextValue == null) return;
      const nextDisplay = displayValue(nextValue);
      if (!nextDisplay) return;
      before[key] = displayValue((client as unknown as Record<string, unknown>)[clientKey]);
      after[key] = nextDisplay;
      updatedFields[key] = nextDisplay;
      updateData[clientKey] = nextValue;
    };

    for (const field of fields) {
      switch (field) {
        case 'businessName':
          setField(field, 'businessName', company.name);
          break;
        case 'businessEntityType':
          setField(field, 'businessEntityType', company.companyType);
          break;
        case 'incorporationDate': {
          const iso = normalizeIncorporationDate(company.incorporationDate);
          if (iso) {
            setField(field, 'businessIncorporationDate', new Date(`${iso}T00:00:00.000Z`));
          }
          break;
        }
        case 'incorporationState':
          setField(field, 'businessIncorporationState', normalizeStateCode(company.jurisdictionCode));
          break;
        case 'address1':
          if (parsedAddress) setField(field, 'businessAddress1', parsedAddress.address1);
          break;
        case 'city':
          if (parsedAddress) setField(field, 'businessCity', parsedAddress.city);
          break;
        case 'state':
          if (parsedAddress) setField(field, 'businessState', parsedAddress.state);
          break;
        case 'zipCode':
          if (parsedAddress) setField(field, 'businessZipCode', parsedAddress.zipCode);
          break;
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new ValidationError('No non-empty OpenCorporates values available for the selected fields');
    }

    await prisma.client.update({
      where: { id: clientId },
      data: updateData,
    });

    await createApplicationActivityLog({
      applicationId: application.id,
      user,
      actionType: 'APPLICATION_UPDATED',
      actionDescription: 'Synced OpenCorporates company fields into application business profile',
      req,
      metadata: {
        source: 'opencorporates',
        companyNumber: company.companyNumber,
        jurisdictionCode: company.jurisdictionCode,
        companyName: company.name,
        fields: Object.keys(updatedFields),
        before,
        after,
        ownersModified: false,
      },
    });

    const backgroundCheck = await prisma.backgroundCheck.findUnique({
      where: { applicationId: application.id },
      select: {
        id: true,
        items: {
          where: { checkType: 'OPENCORPORATES' },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (backgroundCheck?.id) {
      await prisma.backgroundCheckEvent.create({
        data: {
          backgroundCheckId: backgroundCheck.id,
          itemId: backgroundCheck.items?.[0]?.id ?? null,
          action: 'opencorporates_synced_to_client',
          detail: {
            clientId,
            companyNumber: company.companyNumber,
            jurisdictionCode: company.jurisdictionCode,
            fields: Object.keys(updatedFields),
            before,
            after,
            ownersModified: false,
          },
          actorId: user?.id ?? null,
        },
      });
    }

    return { clientId, updatedFields, before, after };
  },

  getAuthenticatedUser(req: Request): AuthenticatedUser | null {
    return getAuthenticatedUserFromRequest(req);
  },
};
