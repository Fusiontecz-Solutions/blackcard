import type { Request, Response } from 'express';
import type { UploadedFile } from 'express-fileupload';
import {
  createDocuSignAccountProfile,
  deleteDocuSignAccountProfile,
  getDocuSignAccountProfileById,
  listDocuSignAccountProfileOptions,
  listDocuSignAccountProfiles,
  updateDocuSignAccountProfile,
} from '../services/docusignAccountProfileService';
import {
  createFunderProfile,
  deleteFunderProfile,
  getFunderProfileById,
  listFunderProfiles,
  updateFunderProfile,
  uploadFunderContractPdf,
  uploadFunderLogo,
  uploadFunderLetterLogo,
  uploadFunderSupplementalPdf,
  uploadFunderDisclosurePdf,
  uploadFunderNamedAddendumPdf,
  listFunderDocumentTemplates,
  deleteFunderDocumentTemplate,
  type FunderProfileInput,
} from '../services/funderProfileService';
import { resolveContractCcDefaultsForApi } from '../utils/contractCcDefaults';
import type { FunderSupplementalLayoutType } from '../utils/funderContractLayout';

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /not found/i.test(message) ? 404 : 400;
  return res.status(status).json({ success: false, message });
}

function getUploadedContractFile(req: Request): UploadedFile | null {
  const files = (req as Request & { files?: { contract?: UploadedFile | UploadedFile[] } }).files;
  if (!files?.contract) return null;
  const file = files.contract;
  return Array.isArray(file) ? file[0] : file;
}

function getUploadedLogoFile(req: Request): UploadedFile | null {
  const files = (req as Request & { files?: { logo?: UploadedFile | UploadedFile[] } }).files;
  if (!files?.logo) return null;
  const file = files.logo;
  return Array.isArray(file) ? file[0] : file;
}

function getUploadedLetterLogoFile(req: Request): UploadedFile | null {
  const files = (req as Request & {
    files?: { letterLogo?: UploadedFile | UploadedFile[] };
  }).files;
  if (!files?.letterLogo) return null;
  const file = files.letterLogo;
  return Array.isArray(file) ? file[0] : file;
}

function getUploadedSupplementalFile(
  req: Request,
  field: string,
): UploadedFile | null {
  const files = (req as Request & { files?: Record<string, UploadedFile | UploadedFile[]> }).files;
  const raw = files?.[field];
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] : raw;
}

const SUPPLEMENTAL_UPLOAD_FIELDS: Record<string, FunderSupplementalLayoutType> = {
  flexAddendum: 'flex_addendum',
  balanceTransfer: 'balance_transfer',
  caseTakeoverBalanceTransfer: 'case_takeover_addendum',
  caseTakeoverAddendum: 'case_takeover_addendum',
  achAuthorization: 'ach_authorization',
};

function parseAllowedStates(raw: unknown): string[] | undefined {
  if (raw == null || raw === '') return undefined;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s).trim()).filter(Boolean);
    }
  } catch {
    // fall through to comma-separated
  }
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFunderProfileBody(body: Record<string, unknown>): FunderProfileInput {
  const allowedStates = parseAllowedStates(body.allowedStates);
  const excludedStates = parseAllowedStates(body.excludedStates);
  const isActiveRaw = body.isActive;
  const isActive =
    isActiveRaw === undefined || isActiveRaw === null || isActiveRaw === ''
      ? undefined
      : isActiveRaw === true || isActiveRaw === 'true';

  const assignsDealIdRaw = body.assignsDealId;
  const assignsDealId =
    assignsDealIdRaw === undefined || assignsDealIdRaw === null || assignsDealIdRaw === ''
      ? undefined
      : assignsDealIdRaw === true || assignsDealIdRaw === 'true';

  const payload: FunderProfileInput = {
    name: String(body.name || '').trim(),
    displayName: body.displayName ? String(body.displayName).trim() : undefined,
    dealIdPrefix: body.dealIdPrefix ? String(body.dealIdPrefix).trim() : undefined,
    assignsDealId,
    mainContractLayoutKey: body.mainContractLayoutKey
      ? String(body.mainContractLayoutKey).trim()
      : undefined,
    contractPdfFileName: body.contractPdfFileName
      ? String(body.contractPdfFileName).trim()
      : undefined,
    organization: body.organization ? String(body.organization).trim() : undefined,
    legalName: body.legalName ? String(body.legalName).trim() : undefined,
    contactEmail:
      body.contactEmail !== undefined && body.contactEmail !== null
        ? String(body.contactEmail).trim() || null
        : undefined,
    contactPhone:
      body.contactPhone !== undefined && body.contactPhone !== null
        ? String(body.contactPhone).trim() || null
        : undefined,
    defaultCcEmail:
      body.defaultCcEmail !== undefined && body.defaultCcEmail !== null
        ? String(body.defaultCcEmail).trim() || null
        : undefined,
    addressLine1:
      body.addressLine1 !== undefined && body.addressLine1 !== null
        ? String(body.addressLine1).trim() || null
        : undefined,
    addressCity:
      body.addressCity !== undefined && body.addressCity !== null
        ? String(body.addressCity).trim() || null
        : undefined,
    addressState:
      body.addressState !== undefined && body.addressState !== null
        ? String(body.addressState).trim() || null
        : undefined,
    addressZip:
      body.addressZip !== undefined && body.addressZip !== null
        ? String(body.addressZip).trim() || null
        : undefined,
    docusignAccountProfileId:
      body.docusignAccountProfileId === '' || body.docusignAccountProfileId == null
        ? null
        : String(body.docusignAccountProfileId),
    sortOrder:
      body.sortOrder != null && body.sortOrder !== ''
        ? Number(body.sortOrder)
        : undefined,
    isActive,
  };

  if (body.documentsSource !== undefined && body.documentsSource !== null && body.documentsSource !== '') {
    payload.documentsSource = String(body.documentsSource).trim();
  }
  if (body.sharedDocumentsFunderId !== undefined) {
    payload.sharedDocumentsFunderId =
      body.sharedDocumentsFunderId === '' || body.sharedDocumentsFunderId == null
        ? null
        : String(body.sharedDocumentsFunderId);
  }
  if (
    body.addendumDocumentsSource !== undefined &&
    body.addendumDocumentsSource !== null &&
    body.addendumDocumentsSource !== ''
  ) {
    payload.addendumDocumentsSource = String(body.addendumDocumentsSource).trim();
  }
  if (
    body.disclosureDocumentsSource !== undefined &&
    body.disclosureDocumentsSource !== null &&
    body.disclosureDocumentsSource !== ''
  ) {
    payload.disclosureDocumentsSource = String(body.disclosureDocumentsSource).trim();
  }
  if (body.sharedAddendumFunderId !== undefined) {
    payload.sharedAddendumFunderId =
      body.sharedAddendumFunderId === '' || body.sharedAddendumFunderId == null
        ? null
        : String(body.sharedAddendumFunderId);
  }
  if (body.sharedDisclosureFunderId !== undefined) {
    payload.sharedDisclosureFunderId =
      body.sharedDisclosureFunderId === '' || body.sharedDisclosureFunderId == null
        ? null
        : String(body.sharedDisclosureFunderId);
  }

  const optionalTrimmed = (
    key:
      | 'letterCompanyName'
      | 'letterLogoUrl'
      | 'letterWatermarkUrl'
      | 'letterAccentStripLight'
      | 'letterAccentStripDark'
      | 'letterInfoTableIconBg'
      | 'letterWireBankName'
      | 'letterWireAddressLine1'
      | 'letterWireCityStateZip'
      | 'letterWireRoutingNumber'
      | 'letterWireAccountNumber',
  ) => {
    if (body[key] === undefined) return;
    payload[key] =
      body[key] === null || body[key] === ''
        ? null
        : String(body[key]).trim() || null;
  };
  optionalTrimmed('letterCompanyName');
  optionalTrimmed('letterLogoUrl');
  optionalTrimmed('letterWatermarkUrl');
  optionalTrimmed('letterAccentStripLight');
  optionalTrimmed('letterAccentStripDark');
  optionalTrimmed('letterInfoTableIconBg');
  optionalTrimmed('letterWireBankName');
  optionalTrimmed('letterWireAddressLine1');
  optionalTrimmed('letterWireCityStateZip');
  optionalTrimmed('letterWireRoutingNumber');
  optionalTrimmed('letterWireAccountNumber');

  if (allowedStates !== undefined) {
    payload.allowedStates = allowedStates;
  }
  if (excludedStates !== undefined) {
    payload.excludedStates = excludedStates;
  }

  return payload;
}

async function saveFunderWithOptionalAssets(
  req: Request,
  save: () => Promise<Awaited<ReturnType<typeof createFunderProfile>>>,
) {
  const contractFile = getUploadedContractFile(req);
  const logoFile = getUploadedLogoFile(req);
  const letterLogoFile = getUploadedLetterLogoFile(req);
  let data = await save();

  if (contractFile) {
    const funderId = String(data.id || '').trim();
    const funderName = String(data.name || '').trim();
    if (!funderId || !funderName) {
      throw new Error('Funder id and name are required to upload a contract.');
    }
    data = await uploadFunderContractPdf(funderId, funderName, contractFile);
  }

  if (logoFile) {
    const funderId = String(data.id || '').trim();
    if (!funderId) {
      throw new Error('Funder id is required to upload a logo.');
    }
    data = await uploadFunderLogo(funderId, logoFile);
  }

  if (letterLogoFile) {
    const funderId = String(data.id || '').trim();
    if (!funderId) {
      throw new Error('Funder id is required to upload a letter logo.');
    }
    data = await uploadFunderLetterLogo(funderId, letterLogoFile);
  }

  for (const [field, supplementalType] of Object.entries(SUPPLEMENTAL_UPLOAD_FIELDS)) {
    const supplementalFile = getUploadedSupplementalFile(req, field);
    if (!supplementalFile) continue;
    const funderId = String(data.id || '').trim();
    const funderName = String(data.name || '').trim();
    if (!funderId || !funderName) {
      throw new Error('Funder id and name are required to upload supplemental PDFs.');
    }
    await uploadFunderSupplementalPdf(
      funderId,
      funderName,
      supplementalType,
      supplementalFile,
    );
  }

  const disclosureFile = getUploadedSupplementalFile(req, 'disclosure');
  if (disclosureFile) {
    const funderId = String(data.id || '').trim();
    const funderName = String(data.name || '').trim();
    const disclosureState = String((req.body as Record<string, unknown>)?.disclosureState || 'texas').trim();
    const disclosureFrequency = String(
      (req.body as Record<string, unknown>)?.disclosureFrequency || 'daily',
    ).trim();
    if (!funderId || !funderName) {
      throw new Error('Funder id and name are required to upload disclosure PDFs.');
    }
    await uploadFunderDisclosurePdf(
      funderId,
      funderName,
      disclosureState,
      disclosureFrequency,
      disclosureFile,
    );
  }

  return data;
}

export const listDocuSignProfiles = async (_req: Request, res: Response) => {
  try {
    const data = await listDocuSignAccountProfiles();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const listDocuSignProfileOptions = async (_req: Request, res: Response) => {
  try {
    const data = await listDocuSignAccountProfileOptions();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getDocuSignProfile = async (req: Request, res: Response) => {
  try {
    const data = await getDocuSignAccountProfileById(String(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const createDocuSignProfile = async (req: Request, res: Response) => {
  try {
    const data = await createDocuSignAccountProfile(req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateDocuSignProfile = async (req: Request, res: Response) => {
  try {
    const data = await updateDocuSignAccountProfile(String(req.params.id), req.body || {});
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeDocuSignProfile = async (req: Request, res: Response) => {
  try {
    const data = await deleteDocuSignAccountProfile(String(req.params.id));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const listFunders = async (req: Request, res: Response) => {
  try {
    const state = req.query.state ? String(req.query.state) : undefined;
    const activeOnly = req.query.activeOnly !== 'false';
    const data = await listFunderProfiles({ state, activeOnly });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Tenant platform default CC + optional funder override (resolved).
 * Used by CRM + Super Admin tenant-proxy Contract/ACH send UI.
 */
export const getContractCcDefaults = async (req: Request, res: Response) => {
  try {
    const q = req.query || {};
    const funderName = q.funderName != null ? String(q.funderName) : undefined;
    const state =
      q.state != null
        ? String(q.state)
        : q.contractState != null
          ? String(q.contractState)
          : undefined;
    const funderProfileId =
      q.funderProfileId != null ? String(q.funderProfileId) : undefined;
    const contractIdRaw = q.contractId != null ? String(q.contractId).trim() : '';
    const contractIdNum = contractIdRaw ? Number(contractIdRaw) : NaN;
    const contractId =
      Number.isFinite(contractIdNum) && contractIdNum > 0 ? contractIdNum : undefined;

    const data = await resolveContractCcDefaultsForApi({
      funderName,
      state,
      funderProfileId,
      contractId,
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const getFunder = async (req: Request, res: Response) => {
  try {
    const data = await getFunderProfileById(String(req.params.id));
    if (!data) return res.status(404).json({ success: false, message: 'Not found' });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const createFunder = async (req: Request, res: Response) => {
  try {
    const input = parseFunderProfileBody((req.body || {}) as Record<string, unknown>);
    if (!input.name) {
      return res.status(400).json({ success: false, message: 'Funder name is required.' });
    }
    const data = await saveFunderWithOptionalAssets(req, () => createFunderProfile(input));
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const updateFunder = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const input = parseFunderProfileBody((req.body || {}) as Record<string, unknown>);
    const data = await saveFunderWithOptionalAssets(req, () =>
      updateFunderProfile(id, input),
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeFunder = async (req: Request, res: Response) => {
  try {
    const data = await deleteFunderProfile(String(req.params.id));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const listFunderDocuments = async (req: Request, res: Response) => {
  try {
    const data = await listFunderDocumentTemplates(String(req.params.id));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const uploadFunderDisclosure = async (req: Request, res: Response) => {
  try {
    const funderId = String(req.params.id || '').trim();
    const funder = await getFunderProfileById(funderId);
    if (!funder) return res.status(404).json({ success: false, message: 'Funder not found.' });

    const file = getUploadedSupplementalFile(req, 'file');
    if (!file) {
      return res.status(400).json({ success: false, message: 'PDF file is required (field: file).' });
    }

    const state = String((req.body as Record<string, unknown>)?.state || '').trim();
    const frequency = String((req.body as Record<string, unknown>)?.frequency || 'daily').trim();
    if (!state) {
      return res.status(400).json({ success: false, message: 'State is required.' });
    }

    const data = await uploadFunderDisclosurePdf(
      funderId,
      funder.name,
      state,
      frequency,
      file,
    );
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const uploadFunderAddendum = async (req: Request, res: Response) => {
  try {
    const funderId = String(req.params.id || '').trim();
    const funder = await getFunderProfileById(funderId);
    if (!funder) return res.status(404).json({ success: false, message: 'Funder not found.' });

    const file = getUploadedSupplementalFile(req, 'file');
    if (!file) {
      return res.status(400).json({ success: false, message: 'PDF file is required (field: file).' });
    }

    const name = String((req.body as Record<string, unknown>)?.name || '').trim();
    const coordinateLayoutKey = String(
      (req.body as Record<string, unknown>)?.coordinateLayoutKey || '',
    ).trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Addendum name is required.' });
    }
    if (!coordinateLayoutKey) {
      return res.status(400).json({
        success: false,
        message:
          'coordinateLayoutKey is required (flex_addendum, pre_payment_addendum, balance_transfer, case_takeover_addendum, ach_authorization).',
      });
    }

    const data = await uploadFunderNamedAddendumPdf(
      funderId,
      funder.name,
      name,
      coordinateLayoutKey,
      file,
    );
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};

export const removeFunderDocument = async (req: Request, res: Response) => {
  try {
    const data = await deleteFunderDocumentTemplate(
      String(req.params.id),
      String(req.params.templateId),
    );
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error);
  }
};
