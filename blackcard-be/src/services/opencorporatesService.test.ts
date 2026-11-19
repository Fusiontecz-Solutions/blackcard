import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('../config/prismaClient', () => {
  const m = {
    application: { findFirst: jest.fn(), findUnique: jest.fn() },
    client: { findUnique: jest.fn(), update: jest.fn() },
    backgroundCheck: { findUnique: jest.fn() },
    backgroundCheckEvent: { create: jest.fn(async () => ({})) },
    applicationActivityLog: { create: jest.fn(async () => ({})) },
  };
  return { __esModule: true, default: m };
});

jest.mock('./applicationActivityLogService', () => ({
  createApplicationActivityLog: jest.fn(async () => ({})),
}));

jest.mock('./applicationService', () => ({
  getApplicationForUserByRef: jest.fn(),
  getAuthenticatedUserFromRequest: jest.fn(),
}));

import prisma from '../config/prismaClient';
import { createApplicationActivityLog } from './applicationActivityLogService';
import { getApplicationForUserByRef } from './applicationService';
import { ForbiddenError, ValidationError } from '../utils/errors';
import { opencorporatesService } from './opencorporatesService';

const db = prisma as any;
const getApp = getApplicationForUserByRef as unknown as ReturnType<typeof jest.fn>;
const activityLog = createApplicationActivityLog as unknown as ReturnType<typeof jest.fn>;

const company = {
  name: 'SELAH HEALTH, LLC BRANCH',
  companyNumber: '811357483',
  jurisdictionCode: 'us_ar',
  companyType: 'Foreign Limited Liability Company',
  incorporationDate: '2016-07-04',
  registeredAddress: '180 S THORNTON AVE, PIGGOTT, ARKANSAS, 72454, USA',
  opencorporatesUrl: 'https://opencorporates.com/companies/us_ar/811357483',
  officers: [{ name: 'TIMOTHY MICHAEL SMALLMON', position: 'Agent' }],
};

describe('opencorporatesService.syncToClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getApp.mockResolvedValue({
      forbidden: false,
      application: {
        id: 'app-1',
        clientId: 'client-1',
        client: { id: 'client-1' },
      },
    });
    db.client.findUnique.mockResolvedValue({
      id: 'client-1',
      businessName: 'Old Name',
      businessEntityType: 'Corp',
      businessIncorporationDate: null,
      businessIncorporationState: 'NY',
      businessAddress1: '1 Main',
      businessCity: 'Albany',
      businessState: 'NY',
      businessZipCode: '12207',
    });
    db.client.update.mockResolvedValue({});
    db.backgroundCheck.findUnique.mockResolvedValue({
      id: 'bc-1',
      items: [{ id: 'item-oc' }],
    });
  });

  it('updates allowlisted fields and never touches owners', async () => {
    const result = await opencorporatesService.syncToClient(
      '11',
      {
        company,
        fields: [
          'businessName',
          'businessEntityType',
          'incorporationDate',
          'incorporationState',
          'address1',
          'city',
          'state',
          'zipCode',
        ],
      },
      { id: 'u1', role: 'UNDERWRITER' },
    );

    expect(db.client.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'client-1' },
        data: expect.objectContaining({
          businessName: company.name,
          businessEntityType: company.companyType,
          businessIncorporationState: 'AR',
          businessAddress1: '180 S THORNTON AVE',
          businessCity: 'PIGGOTT',
          businessState: 'AR',
          businessZipCode: '72454',
        }),
      }),
    );
    expect(db.client.update.mock.calls[0][0].data).not.toHaveProperty('ownerFirstName');
    expect(db.client.update.mock.calls[0][0].data).not.toHaveProperty('owners');
    expect(result.updatedFields.businessName).toBe(company.name);
    expect(activityLog).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          before: expect.any(Object),
          after: expect.any(Object),
          ownersModified: false,
        }),
      }),
    );
  });

  it('rejects blank-value sync payloads', async () => {
    await expect(
      opencorporatesService.syncToClient(
        '11',
        { company: { ...company, companyType: undefined }, fields: ['businessEntityType'] },
        { id: 'u1', role: 'UNDERWRITER' },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it('rejects unauthorized application access', async () => {
    getApp.mockResolvedValue({ forbidden: true, application: null });
    await expect(
      opencorporatesService.syncToClient(
        '11',
        { company, fields: ['businessName'] },
        { id: 'u1', role: 'AGENT' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(db.client.update).not.toHaveBeenCalled();
  });

  it('rejects unsupported owner or officer fields', async () => {
    await expect(
      opencorporatesService.syncToClient(
        '11',
        { company, fields: ['officers'] },
        { id: 'u1', role: 'UNDERWRITER' },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.client.update).not.toHaveBeenCalled();
  });
});
