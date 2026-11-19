import { isDecisionLogicReportPayloadComplete } from "@/lib/decisionLogicReportStatus";

const baseUrl = `${import.meta.env.VITE_API_BASE_URL}/decision-logic`;

function apiErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const o = body as Record<string, unknown>;
  const msg =
    (typeof o.message === "string" && o.message) ||
    (o.error &&
      typeof o.error === "object" &&
      typeof (o.error as { description?: string }).description === "string" &&
      (o.error as { description: string }).description) ||
    undefined;
  return msg ? String(msg) : undefined;
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractDecisionLogicRequestCode(payload: any): string {
  const direct = String(payload?.requestCode ?? "").trim();
  if (direct) return direct;
  const nested = String(payload?.requestCode?.data?.requestCode ?? "").trim();
  if (nested) return nested;
  const alt = String(payload?.data?.requestCode ?? "").trim();
  if (alt) return alt;
  return "";
}

export async function initiateDecisionLogic(
  clientId: number,
  ownerId: number,
  bankAccountId: number
) {
  try {
    const response = await fetch(`${baseUrl}/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessOwnerId: ownerId,
        bankAccountId: bankAccountId,
      }),
    });

    if (!response.ok) {
      const errorData = await parseJsonSafely(response);
      throw new Error(
        apiErrorMessage(errorData) || "Unknown server error",
      );
    }

    return await response.json();
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "An unknown error occurred.",
    };
  }
}

export async function verifyDecisionLogicToken(token: string) {
  try {
    const response = await fetch(`${baseUrl}/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      return await response.json();
    } else {
      const errorData = await parseJsonSafely(response);
      throw new Error(
        apiErrorMessage(errorData) || "Token verification failed.",
      );
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred.",
    };
  }
}

export async function generateDecisionLogicRequestCode(
  businessOwnerId: number,
  bankAccountId: number,
  applicationId?: string | null,
) {
  try {
    const response = await fetch(`${baseUrl}/request-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        businessOwnerId,
        bankAccountId,
        ...(applicationId ? { applicationId } : {}),
      }),
    });

    if (!response.ok) {
      const errorData = await parseJsonSafely(response);
      throw new Error(
        apiErrorMessage(errorData) ||
          `Decision Logic request-code failed (HTTP ${response.status}).`,
      );
    }

    const responseData = await response.json();

    const requestCode = extractDecisionLogicRequestCode(responseData);
    if (!requestCode) {
      throw new Error(
        responseData?.requestCode?.errorMessage ||
          responseData?.message ||
          "Request code generation failed."
      );
    }

    return {
      requestCode,
      raw: responseData,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "An unknown error occurred. Please try again later.",
    };
  }
}

export async function generateDecisionLogicReport(
  requestCode: string,
  businessOwnerId: number,
  bankAccountId: number,
  applicationId?: string | null,
) {
  try {
    const response = await fetch(`${baseUrl}/generate-report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requestCode: requestCode,
        businessOwnerId: businessOwnerId,
        bankAccountId: bankAccountId,
        ...(applicationId ? { applicationId } : {}),
      }),
    });

    if (!response.ok) {
      const errorBody = await parseJsonSafely(response);
      throw new Error(
        apiErrorMessage(errorBody) || "Failed to generate Decision Logic report.",
      );
    }

    return await response.json();
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error?.message
        : "An unexpected error occurred while processing the request. Please try again later.";

    return { error: errorMessage };
  }
}

const REPORT_FETCH_ATTEMPTS = 4;
const REPORT_UNTIL_COMPLETE_ATTEMPTS = 30;
const REPORT_UNTIL_COMPLETE_INTERVAL_MS = 5000;

function isSoftReportFetchError(message: string): boolean {
  return /not ready|not complete|pending|timeout|429|502|503|504|temporar|try again|empty|network|fetch|verification is not complete/i.test(
    message.toLowerCase(),
  );
}

/** Retry when DL report is not ready immediately after request-code creation. */
export async function generateDecisionLogicReportWithRetry(
  requestCode: string,
  businessOwnerId: number,
  bankAccountId: number,
  applicationId?: string | null,
) {
  let last: Awaited<ReturnType<typeof generateDecisionLogicReport>> | undefined;

  for (let attempt = 0; attempt < REPORT_FETCH_ATTEMPTS; attempt++) {
    last = await generateDecisionLogicReport(
      requestCode,
      businessOwnerId,
      bankAccountId,
      applicationId,
    );
    const err =
      last &&
      typeof last === "object" &&
      "error" in last &&
      typeof (last as { error?: string }).error === "string"
        ? (last as { error: string }).error
        : "";
    if (!err && isDecisionLogicReportPayloadComplete(last)) {
      return last;
    }
    if (!err && !isDecisionLogicReportPayloadComplete(last)) {
      last = {
        error:
          "Decision Logic verification is not complete yet. The customer must finish bank login in the widget.",
      };
    }
    const soft = isSoftReportFetchError(err);
    if (!soft || attempt === REPORT_FETCH_ATTEMPTS - 1) {
      return last;
    }
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1200 * (attempt + 1));
    });
  }
  return last;
}

/**
 * Poll generate-report until Decision Logic returns a completed report with bank data.
 * Used after the customer finishes the hosted widget flow.
 */
export async function generateDecisionLogicReportUntilComplete(
  requestCode: string,
  businessOwnerId: number,
  bankAccountId: number,
  applicationId?: string | null,
) {
  let last: Awaited<ReturnType<typeof generateDecisionLogicReport>> | undefined;

  for (let attempt = 0; attempt < REPORT_UNTIL_COMPLETE_ATTEMPTS; attempt++) {
    last = await generateDecisionLogicReport(
      requestCode,
      businessOwnerId,
      bankAccountId,
      applicationId,
    );
    const err =
      last &&
      typeof last === "object" &&
      "error" in last &&
      typeof (last as { error?: string }).error === "string"
        ? (last as { error: string }).error
        : "";

    if (!err && isDecisionLogicReportPayloadComplete(last)) {
      return last;
    }

    if (!err && !isDecisionLogicReportPayloadComplete(last)) {
      last = {
        error:
          "Decision Logic verification is not complete yet. The customer must finish bank login in the widget.",
      };
    }

    if (!isSoftReportFetchError(err) || attempt === REPORT_UNTIL_COMPLETE_ATTEMPTS - 1) {
      return last;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, REPORT_UNTIL_COMPLETE_INTERVAL_MS);
    });
  }

  return last;
}

/**
 * Ops-initiated flow: create request code from CRM bank details and fetch the report
 * without emailing the client a hosted link.
 */
export async function runDecisionLogicVerificationInApp(
  businessOwnerId: number,
  bankAccountId: number,
  applicationId?: string | null,
) {
  const requestCodeRes = await generateDecisionLogicRequestCode(
    businessOwnerId,
    bankAccountId,
    applicationId,
  );
  if ((requestCodeRes as { error?: string })?.error) {
    return {
      error: String((requestCodeRes as { error?: string }).error),
    };
  }

  const requestCode = String(
    (requestCodeRes as { requestCode?: string })?.requestCode ?? "",
  ).trim();
  if (!requestCode) {
    return { error: "Request code was not returned by the server." };
  }

  const reportRes = await generateDecisionLogicReportWithRetry(
    requestCode,
    businessOwnerId,
    bankAccountId,
    applicationId,
  );
  if ((reportRes as { error?: string })?.error) {
    return {
      error: String((reportRes as { error?: string }).error),
      requestCode,
    };
  }

  return {
    requestCode,
    report: reportRes,
  };
}

export async function fetchDecisionLogicReport(
  clientId: number,
  ownerId: number
) {
  try {
    const response = await fetch(
      `${baseUrl}/report?businessOwnerId=${ownerId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorBody = await parseJsonSafely(response);
      throw new Error(
        apiErrorMessage(errorBody) || "Failed to fetch report.",
      );
    }

    return await response.json();
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "An unexpected error occurred while processing the request. Please try again later.";

    return { error: errorMessage };
  }
}

function authHeaders(): HeadersInit {
  const token =
    localStorage.getItem("token")?.toString() ||
    sessionStorage.getItem("token")?.toString() ||
    "";
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}

async function parsePdfErrorMessage(response: Response): Promise<string> {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await response.json();
      return (
        apiErrorMessage(body) ||
        "Could not generate the Decision Logic PDF."
      );
    }
    const text = await response.text();
    if (text.trim()) {
      try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed.message) return parsed.message;
      } catch {
        // not JSON
      }
    }
  } catch {
    // ignore parse failures
  }
  return "Could not generate the Decision Logic PDF.";
}

function assertPdfBlob(blob: Blob): void {
  if (blob.type && blob.type !== "application/pdf") {
    throw new Error("Server did not return a PDF file.");
  }
  if (blob.size < 128) {
    throw new Error("Generated PDF was empty.");
  }
}

export function decisionLogicPdfFilename(nameHint?: string): string {
  const safeName = (nameHint || "report")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `Decision-Logic-Report-${safeName || "report"}.pdf`;
}

export async function fetchDecisionLogicReportPdfBlob(
  ownerId: number,
): Promise<{ blob: Blob; filename: string }> {
  const response = await fetch(
    `${baseUrl}/report/pdf?businessOwnerId=${ownerId}`,
    {
      method: "GET",
      headers: {
        ...authHeaders(),
      },
    },
  );

  if (!response.ok) {
    throw new Error(await parsePdfErrorMessage(response));
  }

  const blob = await response.blob();
  assertPdfBlob(blob);

  const disposition = response.headers.get("content-disposition") || "";
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename =
    match?.[1]?.trim() ||
    decisionLogicPdfFilename(String(ownerId));

  return { blob, filename };
}

export async function downloadDecisionLogicReportPdf(
  ownerId: number,
  nameHint?: string,
): Promise<void> {
  const { blob, filename } = await fetchDecisionLogicReportPdfBlob(ownerId);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || decisionLogicPdfFilename(nameHint);
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
