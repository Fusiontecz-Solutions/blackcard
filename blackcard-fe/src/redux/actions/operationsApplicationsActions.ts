import { createAsyncThunk } from "@reduxjs/toolkit";
import { axiosGet } from "../axios";
import type { Application } from "@/types/applicationTypes";

export interface FetchOperationsApplicationsParams {
  /** When omitted, loads all applications (no `operationsStatus` query on the API). */
  operationsStatus?: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface FetchOperationsApplicationsResult {
  data: Application[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  } | null;
  operationsStatus: string;
  search: string;
}

function normalizePagination(payload: Record<string, unknown> | undefined) {
  if (!payload?.pagination && !(payload as { data?: unknown })?.data) {
    return null;
  }
  const p =
    (payload?.pagination as Record<string, unknown> | undefined) ??
    ({} as Record<string, unknown>);
  const total = Number(p.totalItems ?? p.total ?? 0);
  const page = Number(p.page ?? p.currentPage ?? 1);
  const limit = Number(p.limit ?? p.itemsPerPage ?? 10);
  const totalPages = Number(
    p.totalPages ?? (limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1),
  );
  return {
    total: Number.isFinite(total) ? total : 0,
    page: Number.isFinite(page) ? page : 1,
    limit: Number.isFinite(limit) ? limit : 10,
    totalPages: Number.isFinite(totalPages) ? totalPages : 1,
  };
}

export const fetchOperationsApplications = createAsyncThunk<
  FetchOperationsApplicationsResult,
  FetchOperationsApplicationsParams,
  { rejectValue: string }
>(
  "operationsApplications/fetch",
  async (params, { rejectWithValue }) => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("page", String(params.page ?? 1));
      queryParams.set("limit", String(params.limit ?? 20));
      if (params.operationsStatus?.trim()) {
        queryParams.set("operationsStatus", params.operationsStatus.trim());
      }
      if (params.search?.trim()) {
        queryParams.set("search", params.search.trim());
      }
      queryParams.set("sortBy", params.sortBy ?? "updatedAt");
      queryParams.set("sortOrder", params.sortOrder ?? "desc");

      const response = await axiosGet(`/applications?${queryParams.toString()}`);
      const body = response?.data ?? {};
      const list = Array.isArray(body?.data) ? body.data : [];

      return {
        data: list as Application[],
        pagination: normalizePagination(body),
        operationsStatus: params.operationsStatus?.trim() || "all",
        search: params.search?.trim() ?? "",
      };
    } catch (error: unknown) {
      const message =
        error &&
        typeof error === "object" &&
        "response" in error &&
        (error as { response?: { data?: { message?: string } } }).response?.data
          ?.message;
      return rejectWithValue(
        typeof message === "string" ? message : "Failed to load applications",
      );
    }
  },
);
