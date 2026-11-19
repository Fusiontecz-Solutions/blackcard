import type { SchedulePaymentTrackingRow } from "@/redux/actions/applicationActions";

export type ScheduleTrackingDisplayStatus = "clear" | "bounced" | "upcoming";

export type ScheduleRowWithTrackingStatus = SchedulePaymentTrackingRow & {
  trackingStatus: ScheduleTrackingDisplayStatus;
};

export type ScheduleTrackingSummaryStat = { count: number; sum: number };

export type ScheduleTrackingSummary = Record<
  "all" | ScheduleTrackingDisplayStatus,
  ScheduleTrackingSummaryStat
>;

export const scheduleTrackingStatusLabel: Record<ScheduleTrackingDisplayStatus, string> = {
  clear: "Clear",
  bounced: "Bounced",
  upcoming: "Upcoming",
};

export const scheduleTrackingStatusClass: Record<ScheduleTrackingDisplayStatus, string> = {
  clear:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 dark:border-emerald-900",
  bounced:
    "border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900",
  upcoming:
    "border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-900",
};

/** @deprecated Use `attachScheduleTrackingStatusFromCollections` with collection payments. */
export function attachTrackingStatusToScheduleRows(
  scheduleRows: SchedulePaymentTrackingRow[],
): ScheduleRowWithTrackingStatus[] {
  return scheduleRows.map((row) => ({
    ...row,
    trackingStatus: row.trackingStatus ?? "upcoming",
  }));
}
