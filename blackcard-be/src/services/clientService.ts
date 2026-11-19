import type { Application, BankDetail, Client, ClientBankInfo } from "@prisma/client";
import prisma from "../config/prismaClient";
import { NotFoundError } from "../utils/errors";
import { decryptSensitiveField } from "../utils/fieldEncryption";

export type DecisionLogicBusinessOwner = {
  email: string;
  firstName: string;
  middleName: string;
  lastName: string;
  nameSuffix: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  mobile: string;
  ssn: string;
  dob: Date;
  driverLicenseID: string;
  driverLicenseState: string;
  bankAccounts: Array<{ id: number }>;
};

type ClientWithBankRows = Client & {
  ClientBankInfo: ClientBankInfo[];
  applications: Array<
    Pick<Application, "id" | "applicationId" | "createdAt"> & {
      bankDetails: Array<
        Pick<
          BankDetail,
          | "id"
          | "bankName"
          | "accountNumber"
          | "routingNumber"
          | "createdAt"
          | "updatedAt"
        >
      >;
    }
  >;
};

type DecisionLogicBankRow = {
  bankName: string;
  accountNumber: string;
  routingNumber: string | null;
  createdAt: Date;
};

const clientBankInclude = {
  ClientBankInfo: true,
  applications: {
    select: {
      id: true,
      applicationId: true,
      createdAt: true,
      bankDetails: {
        select: {
          id: true,
          bankName: true,
          accountNumber: true,
          routingNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  },
} as const;

function applicationMatchesRef(
  app: { id: string; applicationId: number },
  ref: string,
): boolean {
  const trimmed = String(ref ?? "").trim();
  if (!trimmed) return false;
  if (trimmed === app.id) return true;
  if (/^\d+$/.test(trimmed) && String(app.applicationId) === trimmed) return true;
  return false;
}

function mapBankDetailRows(
  details: ClientWithBankRows["applications"][number]["bankDetails"],
): DecisionLogicBankRow[] {
  return [...details]
    .sort((a, b) => {
      const byUpdated = b.updatedAt.getTime() - a.updatedAt.getTime();
      if (byUpdated !== 0) return byUpdated;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .map((d) => ({
      bankName: String(d.bankName ?? ""),
      accountNumber: String(decryptSensitiveField(d.accountNumber) ?? ""),
      routingNumber: decryptSensitiveField(d.routingNumber) ?? null,
      createdAt: d.createdAt,
    }));
}

function resolvePreferredBankRows(
  client: ClientWithBankRows,
  applicationRef?: string | null,
): DecisionLogicBankRow[] {
  if (applicationRef) {
    const app = (client.applications ?? []).find((row) =>
      applicationMatchesRef(row, applicationRef),
    );
    if (app?.bankDetails?.length) {
      return mapBankDetailRows(app.bankDetails);
    }
    return [];
  }

  const appRows = [...(client.applications ?? [])].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  for (const app of appRows) {
    if (app.bankDetails?.length) {
      return mapBankDetailRows(app.bankDetails);
    }
  }

  const legacyRows = [...(client.ClientBankInfo ?? [])].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  return legacyRows.map((row) => ({
    bankName: String(row.bankName ?? ""),
    accountNumber: String(row.accountNumber ?? ""),
    routingNumber: row.routingNumber ?? null,
    createdAt: row.createdAt,
  }));
}

function mapClientToDecisionLogicOwner(
  client: ClientWithBankRows,
  applicationRef?: string | null,
): DecisionLogicBusinessOwner {
  const banks = resolvePreferredBankRows(client, applicationRef);
  return {
    // email: client.ownerEmail ?? "",
    email: client.ownerEmail || client.businessEmail || '', 
    firstName: client.ownerFirstName,
    middleName: client.ownerMiddleName ?? "",
    lastName: client.ownerLastName,
    nameSuffix: "",
    address1: client.ownerAddress1 ?? "",
    city: client.ownerCity ?? "",
    state: client.ownerState ?? "",
    zip: client.ownerZipCode ?? "",
    mobile: client.ownerMobileNumber ?? "",
    ssn: client.ownerSsn ?? "",
    dob: client.ownerDateOfBirth ?? new Date(0),
    driverLicenseID: "",
    driverLicenseState: "",
    bankAccounts: banks.map((_b, index) => ({ id: index + 1 })),
  };
}

export const clientService = {
  async fetchBusinessOwner(
    businessOwnerId: number,
    applicationRef?: string | null,
  ): Promise<DecisionLogicBusinessOwner> {
    const client = await prisma.client.findUnique({
      where: { clientId: businessOwnerId },
      include: clientBankInclude,
    });
    if (!client) {
      throw new NotFoundError("Client not found for the given business owner id.");
    }
    return mapClientToDecisionLogicOwner(
      client as ClientWithBankRows,
      applicationRef,
    );
  },

  async fetchBankAccount(
    bankAccountId: number,
    businessOwnerId: number,
    applicationRef?: string | null,
  ) {
    const client = await prisma.client.findUnique({
      where: { clientId: businessOwnerId },
      include: clientBankInclude,
    });
    if (!client) {
      throw new NotFoundError("Client not found for the given business owner id.");
    }
    const c = client as ClientWithBankRows;
    const banks = resolvePreferredBankRows(c, applicationRef);
    const row = banks[bankAccountId - 1];
    if (!row) {
      throw new NotFoundError("Bank account not found for the given id.");
    }
    return {
      id: bankAccountId,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      routingNumber: row.routingNumber,
    };
  },
};
