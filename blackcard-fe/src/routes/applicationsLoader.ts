import type { LoaderFunctionArgs } from "react-router";
import { applicationsListParamsCacheKey } from "@/lib/applicationsListCache";
import { buildInitialApplicationsListParamsFromSearch } from "@/lib/applicationsListParams";

/**
 * `/applications` — returns list cache key only. The page always dispatches
 * `getApplications` with `skipListCacheRead` so returning from browse (or any
 * other list) does not show a stale session/Redux snapshot.
 */
export async function applicationsPageLoader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const params = buildInitialApplicationsListParamsFromSearch(url.search);
  const listFetchKey = applicationsListParamsCacheKey(params);
  return { listFetchKey };
}
