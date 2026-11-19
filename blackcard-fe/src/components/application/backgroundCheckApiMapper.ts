import { BACKGROUND_CHECK_RESOURCES } from "@/config/externalLinks";
import type {
  BackgroundCheck,
  BackgroundCheckItem as ApiItem,
} from "@/redux/slices/backgroundCheckSlice";
import type {
  BackgroundCheckFormState,
  BackgroundCheckItemState,
  BackgroundCheckRisk,
  BackgroundCheckStatus,
  CompanyBriefData,
} from "./backgroundCheckTypes";
import type { ClearLookupMetadata } from "./clearTypes";
import { isClearLookupMetadata } from "./clearTypes";

const RESOURCE_TO_TYPE: Record<string, ApiItem["checkType"]> = {
  datamerch: "DATAMERCH",
  opencorporates: "OPENCORPORATES",
  sos: "SOS",
  nyscef: "NY_COURT",
  google: "GOOGLE",
  tlo: "TLO",
};

const TYPE_TO_RESOURCE: Record<string, string> = Object.fromEntries(
  Object.entries(RESOURCE_TO_TYPE).map(([resourceId, checkType]) => [checkType, resourceId]),
);

export type ItemIdByResource = Record<string, string>;

type ItemMetadata = {
  noteImages?: BackgroundCheckItemState["noteImages"];
  linkOpenedAt?: string;
  savedAt?: string;
  companyBrief?: CompanyBriefData | null;
};

function emptyFormState(): BackgroundCheckFormState {
  return Object.fromEntries(
    BACKGROUND_CHECK_RESOURCES.map((resource) => [
      resource.id,
      { notes: "", optional: false },
    ]),
  );
}

function resultToRisk(result: string | null | undefined): BackgroundCheckRisk | undefined {
  if (result === "FAIL") return "high";
  if (result === "FLAG") return "medium";
  if (result === "PASS") return "low";
  return undefined;
}

function riskToResult(
  risk?: BackgroundCheckRisk,
  status?: BackgroundCheckStatus,
): string | null {
  if (risk === "high") return "FAIL";
  if (risk === "medium") return "FLAG";
  if (risk === "low") return "PASS";
  if (status === "completed") return "NA";
  return null;
}

function apiStatusToForm(status: string): BackgroundCheckStatus | undefined {
  if (status === "COMPLETE") return "completed";
  return "pending";
}

function formStatusToApi(status?: BackgroundCheckStatus): string {
  if (status === "completed") return "COMPLETE";
  if (status === "pending") return "IN_PROGRESS";
  return "NOT_STARTED";
}

function readMetadata(item: ApiItem & { metadata?: ItemMetadata | null }): ItemMetadata {
  return (item.metadata ?? {}) as ItemMetadata;
}

export function buildItemIdMap(check: BackgroundCheck): ItemIdByResource {
  const map: ItemIdByResource = {};
  for (const item of check.items) {
    const resourceId = TYPE_TO_RESOURCE[item.checkType];
    if (resourceId) map[resourceId] = item.id;
  }
  return map;
}

export function apiCheckToFormState(check: BackgroundCheck): BackgroundCheckFormState {
  const form = emptyFormState();

  for (const item of check.items) {
    const resourceId = TYPE_TO_RESOURCE[item.checkType];
    if (!resourceId) continue;

    const meta = readMetadata(item as ApiItem & { metadata?: ItemMetadata | null });
    const primaryAttachment = item.attachments?.[0];
    const clearMetadata =
      item.checkType === "TLO" && isClearLookupMetadata(item.metadata)
        ? (item.metadata as ClearLookupMetadata)
        : undefined;

    form[resourceId] = {
      notes: item.notes ?? "",
      status: apiStatusToForm(item.status),
      risk: resultToRisk(item.result),
      optional: !item.required,
      attachmentName: primaryAttachment?.originalName ?? undefined,
      attachmentUrl: primaryAttachment?.url ?? undefined,
      attachmentPublicId: primaryAttachment?.publicId ?? undefined,
      attachments: (item.attachments ?? []).map((attachment) => ({
        id: attachment.id,
        name: attachment.originalName ?? "Attachment",
        url: attachment.url,
        publicId: attachment.publicId ?? undefined,
      })),
      noteImages: meta.noteImages,
      linkOpenedAt: meta.linkOpenedAt,
      savedAt: meta.savedAt,
      clearMetadata,
      companyBrief: item.checkType === "GOOGLE" ? meta.companyBrief ?? null : undefined,
    };
  }

  return form;
}

export function formItemToApiPayload(state: BackgroundCheckItemState): {
  notes?: string;
  status?: string;
  result?: string | null;
  required?: boolean;
  metadata?: ItemMetadata;
} {
  const status = formStatusToApi(state.status);
  const result = riskToResult(state.risk, state.status);

  const metadata: ItemMetadata = {};
  if (state.noteImages?.length) metadata.noteImages = state.noteImages;
  if (state.linkOpenedAt) metadata.linkOpenedAt = state.linkOpenedAt;
  if (state.savedAt) metadata.savedAt = state.savedAt;

  return {
    notes: state.notes,
    status,
    result: status === "COMPLETE" ? (result ?? "NA") : result,
    required: !state.optional,
    metadata: Object.keys(metadata).length ? metadata : {},
  };
}

export function resolveLatestSavedAt(check: BackgroundCheck): string | null {
  let latest: string | null = null;
  for (const item of check.items) {
    const savedAt = readMetadata(item as ApiItem & { metadata?: ItemMetadata | null }).savedAt;
    if (!savedAt) continue;
    if (!latest || new Date(savedAt).getTime() > new Date(latest).getTime()) {
      latest = savedAt;
    }
  }
  return latest;
}
