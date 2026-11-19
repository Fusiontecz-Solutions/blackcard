import { axiosGet } from "@/redux/axios";
import type { ApiResponse } from "@/types/api.types";

export type LetterTemplateField = {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
};

export type LetterTemplateSource = "builtin" | "database";

export type LetterTemplate = {
  id: string;
  name: string;
  funder: string | null;
  category: "letter";
  source: LetterTemplateSource;
  status: string;
  fields: LetterTemplateField[];
  variables: string[];
  body: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type LetterTemplatesMeta = {
  count: number;
  funder: string | null;
  status?: string | null;
  includeBuiltin?: boolean;
  includeDatabase?: boolean;
};

export type GetLetterTemplatesParams = {
  funder?: string;
  status?: string;
  includeBuiltin?: boolean;
  includeDatabase?: boolean;
};

const BASE_PATH = "/letter-templates";

function buildQuery(params?: GetLetterTemplatesParams): string {
  if (!params) return "";
  const qs = new URLSearchParams();
  if (params.funder) qs.set("funder", params.funder);
  if (params.status) qs.set("status", params.status);
  if (params.includeBuiltin === false) qs.set("includeBuiltin", "false");
  if (params.includeDatabase === false) qs.set("includeDatabase", "false");
  const s = qs.toString();
  return s ? `?${s}` : "";
}

function unwrapList(body: unknown): LetterTemplate[] {
  if (Array.isArray(body)) return body as LetterTemplate[];
  if (body && typeof body === "object" && "data" in body) {
    const inner = (body as { data: unknown }).data;
    if (Array.isArray(inner)) return inner as LetterTemplate[];
  }
  return [];
}

/**
 * List letter templates (built-in + database) for SuperAdmin / proxy.
 * Requires SUPER_ADMIN JWT or SuperAdmin proxy headers.
 */
export async function getLetterTemplates(
  params?: GetLetterTemplatesParams,
): Promise<LetterTemplate[]> {
  const response = await axiosGet(`${BASE_PATH}${buildQuery(params)}`);
  const body = response.data as Record<string, unknown>;

  if (body && typeof body === "object" && body.success === false) {
    const msg =
      typeof body.message === "string"
        ? body.message
        : "Failed to load letter templates";
    throw new Error(msg);
  }

  return unwrapList(body);
}

/**
 * Get a single letter template (with Data Personalization `fields`) by id.
 */
export async function getLetterTemplateById(
  id: string,
  opts?: { funder?: string },
): Promise<LetterTemplate> {
  const qs = opts?.funder
    ? `?funder=${encodeURIComponent(opts.funder)}`
    : "";
  const response = await axiosGet(
    `${BASE_PATH}/${encodeURIComponent(id)}${qs}`,
  );
  const body = response.data as ApiResponse<LetterTemplate> & {
    message?: string;
  };

  if (body && typeof body === "object" && body.success === false) {
    const msg =
      typeof body.message === "string"
        ? body.message
        : "Failed to load letter template";
    throw new Error(msg);
  }

  if (!body?.data) {
    throw new Error("Letter template not found");
  }

  return body.data;
}
