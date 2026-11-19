import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  cachedDealDetailUpdatedAt,
  fetchDealDetail,
  PORTFOLIO_QUERY_GC_MS,
  PORTFOLIO_QUERY_STALE_MS,
  readCachedDealDetail,
  type DealDetailResponse,
} from './portfolioApi';

export const dealDetailQueryKey = (ref: string | undefined) => ['portfolio', 'deal', ref] as const;

/** Deal hero / sidebar data; shared by both components via the query key. */
export function useDealDetail(ref: string | undefined) {
  const cached = ref ? readCachedDealDetail(ref) : undefined;
  return useQuery<DealDetailResponse>({
    queryKey: dealDetailQueryKey(ref),
    queryFn: () => fetchDealDetail(ref!),
    enabled: !!ref,
    initialData: cached,
    initialDataUpdatedAt: ref ? cachedDealDetailUpdatedAt(ref) : undefined,
    placeholderData: keepPreviousData,
    staleTime: PORTFOLIO_QUERY_STALE_MS,
    gcTime: PORTFOLIO_QUERY_GC_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
