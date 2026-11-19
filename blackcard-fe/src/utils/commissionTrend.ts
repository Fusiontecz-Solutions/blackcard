import type { TermsOffer } from "@/types/termsOfferTypes";

export type CommissionPoint = {
  name: string;
  value: number;
};

export function buildCommissionTrendData(
  termsOffersList: TermsOffer[] | undefined,
  view: "monthly" | "weekly" | "yearly",
): CommissionPoint[] {
  const periodData: { [key: string]: { name: string; value: number } } = {};

  const offers = termsOffersList ?? [];
  if (offers.length === 0) return [];

  const referenceDate =
    offers.length > 0 && offers[0].createdAt
      ? new Date(offers[0].createdAt as any)
      : new Date();
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  if (view === "monthly") {
    const daysInMonth = new Date(refYear, refMonth + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const periodKey = `${refYear}-${String(refMonth + 1).padStart(
        2,
        "0",
      )}-${String(day).padStart(2, "0")}`;
      periodData[periodKey] = { name: String(day), value: 0 };
    }
  } else if (view === "yearly") {
    for (let month = 0; month < 12; month++) {
      const date = new Date(refYear, month, 1);
      const periodKey = `${refYear}-${String(month + 1).padStart(2, "0")}`;
      const periodLabel = date.toLocaleDateString("en-US", {
        month: "short",
      });
      periodData[periodKey] = { name: periodLabel, value: 0 };
    }
  } else if (view === "weekly") {
    const monthStart = new Date(refYear, refMonth, 1);
    const monthEnd = new Date(refYear, refMonth + 1, 0);
    const d = new Date(monthStart);
    d.setDate(d.getDate() - d.getDay());
    while (d <= monthEnd) {
      const weekStart = new Date(d);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const periodKey = `${weekStart.getFullYear()}-${String(
        weekStart.getMonth() + 1,
      ).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
      const periodLabel = `${weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;
      periodData[periodKey] = { name: periodLabel, value: 0 };
      d.setDate(d.getDate() + 7);
    }
  }

  offers.forEach((offer) => {
    const created = offer.createdAt ? new Date(offer.createdAt as any) : null;
    if (!created || isNaN(created.getTime())) return;

    let periodKey = "";
    let periodLabel = "";

    if (view === "monthly") {
      periodKey = `${created.getFullYear()}-${String(
        created.getMonth() + 1,
      ).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
      periodLabel = String(created.getDate());
    } else if (view === "weekly") {
      const weekStart = new Date(created);
      weekStart.setDate(created.getDate() - created.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      periodKey = `${weekStart.getFullYear()}-${String(
        weekStart.getMonth() + 1,
      ).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
      periodLabel = `${weekStart.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })} - ${weekEnd.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })}`;
    } else {
      const monthKey = `${created.getFullYear()}-${String(
        created.getMonth() + 1,
      ).padStart(2, "0")}`;
      periodKey = monthKey;
      periodLabel = created.toLocaleDateString("en-US", { month: "short" });
    }

    if (!periodData[periodKey]) {
      periodData[periodKey] = { name: periodLabel, value: 0 };
    }

    const amt = offer.commissionAmount ?? 0;
    periodData[periodKey].value += amt;
  });

  return Object.values(periodData).sort((a, b) => {
    const keys = Object.keys(periodData);
    const aKey = keys.find((key) => periodData[key].name === a.name) || "";
    const bKey = keys.find((key) => periodData[key].name === b.name) || "";
    return aKey.localeCompare(bKey);
  });
}

