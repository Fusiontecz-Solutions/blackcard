import { useQuery } from "@tanstack/react-query";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "@/redux/store";
import { getApplications } from "@/redux/actions/applicationActions";
import type { GetApplicationsParams } from "@/types/applicationTypes";
import { listFetchKeyFromGetApplicationsParams } from "@/lib/applicationsListCache";

type UseApplicationsListQueryOptions = {
  enabled?: boolean;
};

/**
 * React Query orchestrates list fetching while Redux remains the single source
 * of table data and loading/error state used by existing screens.
 */
export function useApplicationsListQuery(
  params: GetApplicationsParams,
  options: UseApplicationsListQueryOptions = {},
) {
  const dispatch = useDispatch<AppDispatch>();

  const fetchKey = listFetchKeyFromGetApplicationsParams(params);

  return useQuery({
    queryKey: ["applications-list", fetchKey],
    enabled: options.enabled ?? true,
    queryFn: async () => {
      // Redux updates via `getApplications.fulfilled` (requestId guard). Do not
      // hydrate again here — a slower, older in-flight response would overwrite
      // the latest list and desync sidebar counts from the table.
      return dispatch(
        getApplications({ ...params, skipListCacheRead: true }),
      ).unwrap();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
}
