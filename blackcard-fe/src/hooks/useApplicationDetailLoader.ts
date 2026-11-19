import { useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { AppDispatch, RootState } from "@/redux/store";
import {
  getApplicationByApplicationId,
  getApplicationById,
} from "@/redux/actions/applicationActions";
import {
  isNumericApplicationRouteParam,
  routeParamMatchesApplication,
} from "@/lib/applicationRouteMatch";
import {
  readApplicationDetailCache,
  writeApplicationDetailCache,
} from "@/lib/applicationDetailCache";
import { findApplicationInListCache } from "@/lib/applicationsListCache";
import { setApplicationDetail } from "@/redux/slices/applicationSlice";

/**
 * Loads application detail once per route param: reuse Redux, detail cache, or
 * any cached applications list row; only calls the API when the app is not in cache.
 */
export function useApplicationDetailLoader(applicationId: string | undefined) {
  const dispatch = useDispatch<AppDispatch>();
  const { loading, isRefreshing, data, error } = useSelector(
    (state: RootState) => state.applicationDetail,
  );
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const fetchDetail = useCallback(() => {
    if (!applicationId) return;
    if (isNumericApplicationRouteParam(applicationId)) {
      void dispatch(getApplicationByApplicationId(applicationId));
    } else {
      void dispatch(getApplicationById(applicationId));
    }
  }, [applicationId, dispatch]);

  useEffect(() => {
    if (!applicationId) return;

    const fromDetail = readApplicationDetailCache(applicationId);
    const fromList =
      fromDetail === undefined
        ? findApplicationInListCache(applicationId)
        : undefined;
    const cachedRow = fromDetail ?? fromList;

    if (fromList) {
      writeApplicationDetailCache(fromList);
    }

    const current = dataRef.current;
    const matchesCurrent =
      !!current && routeParamMatchesApplication(applicationId, current);

    if (!matchesCurrent && cachedRow) {
      dispatch(setApplicationDetail(cachedRow));
      dataRef.current = cachedRow;
    }

    const effective = matchesCurrent
      ? current
      : cachedRow ?? dataRef.current ?? null;
    const aligned =
      !!effective && routeParamMatchesApplication(applicationId, effective);

    if (aligned) {
      return;
    }

    fetchDetail();
  }, [applicationId, dispatch, fetchDetail]);

  const refetch = useCallback(() => {
    fetchDetail();
  }, [fetchDetail]);

  return {
    data,
    loading,
    isRefreshing,
    error,
    refetch,
  };
}
