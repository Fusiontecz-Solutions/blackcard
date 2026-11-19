export type SyndicatorAdminOutletContext = {
  /** Incremented after wallet mutations so nested routes (e.g. transactions) refetch */
  walletRefreshToken: number;
  /** Refetch syndicator header balance and bump wallet token (e.g. after approving a withdrawal). */
  bumpWalletRefresh: () => void;
  /** Header details from `GET /syndicators/:id` (null until loaded). */
  syndicatorName?: string | null;
  syndicatorCompany?: string | null;
  currentBalance?: number | null;
};
