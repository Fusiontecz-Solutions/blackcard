import type { Prisma } from "@prisma/client";
import prisma from "../../config/prismaClient";

function extractRequestCode(details: unknown): string {
  if (Array.isArray(details) && details.length > 0) {
    const r = details[0] as { requestCode?: unknown };
    return typeof r.requestCode === "string" ? r.requestCode : "";
  }
  if (details && typeof details === "object" && "requestCode" in details) {
    const r = details as { requestCode?: unknown };
    return typeof r.requestCode === "string" ? r.requestCode : "";
  }
  return "";
}

type DecisionLogicReportRowDelegate = {
  findMany(args: {
    where: { businessOwnerId: number };
    orderBy?: { createdAt: "asc" | "desc" };
  }): Promise<
    Array<{
      reportsDetails: Prisma.JsonValue;
      requestCode: string;
      businessOwnerId: number;
      bankAccountId: number;
    }>
  >;
  findFirst(args: {
    where: {
      requestCode: string;
      businessOwnerId: number;
      bankAccountId: number;
    };
  }): Promise<{
    reportsDetails: Prisma.JsonValue;
    requestCode: string;
    businessOwnerId: number;
    bankAccountId: number;
  } | null>;
  upsert(args: {
    where: {
      requestCode_businessOwnerId_bankAccountId: {
        requestCode: string;
        businessOwnerId: number;
        bankAccountId: number;
      };
    };
    create: {
      requestCode: string;
      businessOwnerId: number;
      bankAccountId: number;
      reportsDetails: Prisma.InputJsonValue;
    };
    update: { reportsDetails: Prisma.InputJsonValue };
  }): Promise<unknown>;
};

function decisionLogicReportRows(): DecisionLogicReportRowDelegate {
  return (
    prisma as unknown as { decisionLogicReportRow: DecisionLogicReportRowDelegate }
  ).decisionLogicReportRow;
}

export const decisionLogicRepository = {
  async findDecisionLogicReport(businessOwnerId: number) {
    const rows = await decisionLogicReportRows().findMany({
      where: { businessOwnerId },
      orderBy: { createdAt: "desc" },
    });
    return rows.flatMap((row) => {
      const d = row.reportsDetails;
      if (Array.isArray(d)) return d;
      return [d];
    });
  },

  async findExistingReport(
    requestCode: string,
    businessOwnerId: number,
    bankAccountId: number
  ) {
    return decisionLogicReportRows().findFirst({
      where: {
        requestCode,
        businessOwnerId,
        bankAccountId,
      },
    });
  },

  /**
   * Persists Decision Logic payload(s). `reportsDetails` may be a single object or an array
   * (as returned by the external API). Stored as JSON; one row per (requestCode, owner, bank).
   */
  async saveDecisionLogicReport(
    reportsDetails: unknown,
    businessOwnerId: number,
    bankAccountId: number
  ) {
    const requestCode = extractRequestCode(reportsDetails);
    return decisionLogicReportRows().upsert({
      where: {
        requestCode_businessOwnerId_bankAccountId: {
          requestCode,
          businessOwnerId,
          bankAccountId,
        },
      },
      create: {
        requestCode,
        businessOwnerId,
        bankAccountId,
        reportsDetails: reportsDetails as Prisma.InputJsonValue,
      },
      update: {
        reportsDetails: reportsDetails as Prisma.InputJsonValue,
      },
    });
  },
};
