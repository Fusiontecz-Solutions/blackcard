/**
 * CLEAR Person Lookup — a standalone background check.
 *
 * The CLEAR panel inside an application searches the merchant on file. This
 * screen runs the same Thomson Reuters CLEAR Person Search for anyone typed in,
 * for ad-hoc diligence that has no application behind it.
 *
 * Nothing is persisted. The report PDFs come back inline from the API and are
 * turned into blobs in the browser, so closing the page leaves no trace and no
 * stored copy of someone's public-record report.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Download, Eye, FileText, Loader2, Search, ShieldAlert, UserSearch } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { axiosPost } from "@/redux/axios";
import ReportViewerModal from "./ReportViewerModal";
import { revealClearIdForDisplay } from "@/components/application/clearComparison";
import type {
  ClearCorporateAssociationRecord,
  ClearLienJudgmentRecord,
  ClearPersonHit,
} from "@/components/application/clearTypes";

interface PersonSearchResult {
  environment?: string;
  statusCode?: string;
  groupCount?: number;
  groupIds?: string[];
  hits?: ClearPersonHit[];
  ownerName?: string;
}

interface ReportFile {
  kind: "person" | "business";
  groupId: string;
  reportId: string;
  fileName: string;
  pdfBase64: string;
}

interface LookupResult {
  provider: string;
  searchedAt: string;
  groupCount: number;
  personSearches: PersonSearchResult[];
  clearLienJudgments: ClearLienJudgmentRecord[];
  clearCorporateAssociations: ClearCorporateAssociationRecord[];
  reports: {
    attached: ReportFile[];
    errors: Array<{ kind: string; groupId: string; error: string }>;
  };
}

function formatSsnInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function lienTitle(record: ClearLienJudgmentRecord): string {
  const kind = record.kind === "lien" ? "Lien" : "Judgment";
  return record.description?.trim() || `${kind}${record.court ? ` — ${record.court}` : ""}`;
}

export default function ClearPersonLookup() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [ssn, setSsn] = useState("");
  const [includeReports, setIncludeReports] = useState(true);

  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Blob URLs are revoked on the next run so a long session cannot leak them.
  const blobUrlsRef = useRef<string[]>([]);
  const [viewing, setViewing] = useState<{ url: string; fileName: string } | null>(null);

  const canRun = firstName.trim().length > 0 && lastName.trim().length > 0 && !isRunning;

  const releaseBlobUrls = useCallback(() => {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current = [];
  }, []);

  const handleRun = useCallback(async () => {
    if (!canRun) return;

    setIsRunning(true);
    setError(null);
    releaseBlobUrls();

    try {
      const response = await axiosPost("/clear/person-lookup", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ssn: ssn.replace(/\D/g, "") || undefined,
        includeReports,
      });

      const data = response.data?.data as LookupResult;
      setResult(data);
      toast.success(response.data?.message || "CLEAR lookup complete.");
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || "CLEAR lookup failed.";
      setError(message);
      setResult(null);
      toast.error(message);
    } finally {
      setIsRunning(false);
    }
  }, [canRun, firstName, includeReports, lastName, releaseBlobUrls, ssn]);

  const handleReset = useCallback(() => {
    releaseBlobUrls();
    setFirstName("");
    setLastName("");
    setSsn("");
    setResult(null);
    setError(null);
  }, [releaseBlobUrls]);

  /**
   * Materialize the inline base64 PDF as a blob URL. The report only ever
   * exists in memory, so viewing and downloading share the same conversion.
   */
  const toBlobUrl = useCallback((report: ReportFile): string | null => {
    try {
      const binary = atob(report.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      blobUrlsRef.current.push(url);
      return url;
    } catch {
      toast.error("Could not open that report.");
      return null;
    }
  }, []);

  const viewReport = useCallback(
    (report: ReportFile) => {
      const url = toBlobUrl(report);
      if (url) setViewing({ url, fileName: report.fileName || "CLEAR-Report.pdf" });
    },
    [toBlobUrl],
  );

  const downloadReport = useCallback(
    (report: ReportFile) => {
      const url = toBlobUrl(report);
      if (!url) return;

      const link = document.createElement("a");
      link.href = url;
      link.download = report.fileName || "CLEAR-Report.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
    },
    [toBlobUrl],
  );

  const hits = useMemo(
    () => result?.personSearches?.flatMap((search) => search.hits ?? []) ?? [],
    [result],
  );
  const liens = useMemo(
    () => result?.clearLienJudgments?.filter((r) => r.kind === "lien") ?? [],
    [result],
  );
  const judgments = useMemo(
    () => result?.clearLienJudgments?.filter((r) => r.kind === "judgment") ?? [],
    [result],
  );

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="flex items-center gap-2 text-lg font-semibold text-[#0F172A]">
          <UserSearch className="h-5 w-5" /> CLEAR Person Lookup
        </h1>
        <p className="mt-0.5 text-xs text-[#6B7280]">
          Run a Thomson Reuters CLEAR person search outside of an application. Results
          are shown once and never saved.
        </p>
      </div>

      {/* ---------------- search form ---------------- */}
      <div className="rounded-lg border border-[#E5E7EB] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="clear-first-name">First name *</Label>
            <Input
              id="clear-first-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleRun()}
              placeholder="John"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="clear-last-name">Last name *</Label>
            <Input
              id="clear-last-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && handleRun()}
              placeholder="Smith"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="clear-ssn">SSN (optional)</Label>
            <Input
              id="clear-ssn"
              value={ssn}
              onChange={(event) => setSsn(formatSsnInput(event.target.value))}
              onKeyDown={(event) => event.key === "Enter" && handleRun()}
              placeholder="123-45-6789"
              inputMode="numeric"
            />
            <p className="text-[11px] text-[#6B7280]">
              CLEAR combines criteria, so a wrong SSN returns no matches at all. It
              also unmasks the partial SSNs CLEAR returns when the two agree.
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs text-[#374151]">
            <input
              type="checkbox"
              checked={includeReports}
              onChange={(event) => setIncludeReports(event.target.checked)}
              className="h-3.5 w-3.5"
            />
            Generate full reports (liens, judgments, corporate associations) — slower
          </label>

          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} disabled={isRunning}>
              Clear
            </Button>
            <Button onClick={handleRun} disabled={!canRun}>
              {isRunning ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1 h-4 w-4" />
              )}
              {isRunning ? "Searching CLEAR…" : "Run CLEAR search"}
            </Button>
          </div>
        </div>

        {isRunning && includeReports && (
          <p className="mt-2 text-[11px] text-[#6B7280]">
            Report generation can take up to a minute — CLEAR builds the PDF on their
            side and we poll for it.
          </p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ---------------- results ---------------- */}
      {result && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#E5E7EB] bg-[#FAFBFC] px-3 py-2 text-xs text-[#374151]">
            <span className="font-semibold">
              {result.groupCount} possible match{result.groupCount === 1 ? "" : "es"}
            </span>
            <span className="text-[#6B7280]">{result.provider}</span>
            <span className="text-[#6B7280]">
              {new Date(result.searchedAt).toLocaleString()}
            </span>
            <span className="rounded bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-medium text-[#1D4ED8]">
              Not saved
            </span>
          </div>

          <ResultSection title="Matching people" count={hits.length}>
            {hits.length === 0 ? (
              <EmptyNote>No matching records.</EmptyNote>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[#6B7280]">
                    <tr className="border-b border-[#E5E7EB]">
                      <th className="py-1.5 pr-3 font-medium">Name</th>
                      <th className="py-1.5 pr-3 font-medium">SSN</th>
                      <th className="py-1.5 pr-3 font-medium">DOB</th>
                      <th className="py-1.5 pr-3 font-medium">Address</th>
                      <th className="py-1.5 pr-3 font-medium">Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((hit, index) => (
                      <tr
                        key={`${hit.groupId}-${index}`}
                        className="border-b border-[#F1F5F9] last:border-b-0"
                      >
                        <td className="py-1.5 pr-3 font-medium text-[#0F172A]">
                          {[hit.firstName, hit.middleName, hit.lastName]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className="py-1.5 pr-3 font-mono">
                          {revealClearIdForDisplay(hit.ssn, ssn) || "—"}
                        </td>
                        <td className="py-1.5 pr-3">{hit.dateOfBirth || "—"}</td>
                        <td className="py-1.5 pr-3 text-[#374151]">
                          {hit.addressBlob ||
                            [hit.address1, hit.city, hit.state, hit.zipCode]
                              .filter(Boolean)
                              .join(", ") ||
                            "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-[#374151]">
                          {[hit.phoneNumber, hit.email].filter(Boolean).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-[#6B7280]">
                  CLEAR masks part of the date of birth in search results (09/XX/1957).
                  The full date is in the report PDF below.
                </p>
              </div>
            )}
          </ResultSection>

          <div className="grid gap-3 lg:grid-cols-2">
            <ResultSection title="Liens" count={liens.length}>
              <LienList records={liens} />
            </ResultSection>
            <ResultSection title="Judgments" count={judgments.length}>
              <LienList records={judgments} />
            </ResultSection>
          </div>

          <ResultSection
            title="Corporate associations"
            count={result.clearCorporateAssociations.length}
          >
            {result.clearCorporateAssociations.length === 0 ? (
              <EmptyNote>None found.</EmptyNote>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {result.clearCorporateAssociations.map((record, index) => (
                  <li
                    key={`${record.name}-${index}`}
                    className="rounded border border-[#E2E8F0] bg-white px-2 py-1 text-xs text-[#0F172A]"
                  >
                    {record.name}
                    {record.section && (
                      <span className="ml-1.5 text-[10px] text-[#6B7280]">
                        {record.section}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ResultSection>

          <ResultSection title="Reports" count={result.reports.attached.length}>
            {result.reports.attached.length === 0 ? (
              <EmptyNote>
                {includeReports
                  ? "No reports were generated."
                  : "Report generation was turned off for this search."}
              </EmptyNote>
            ) : (
              <ul className="space-y-1.5">
                {result.reports.attached.map((report) => (
                  <li
                    key={report.reportId}
                    className="flex items-center justify-between gap-3 rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-xs text-[#0F172A]">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#6B7280]" />
                      <span className="truncate">{report.fileName}</span>
                      <span className="shrink-0 rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[10px] uppercase text-[#475569]">
                        {report.kind}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => viewReport(report)}
                        className="h-7"
                        title="View report"
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" /> View
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadReport(report)}
                        className="h-7"
                        title="Download report"
                      >
                        <Download className="mr-1 h-3.5 w-3.5" /> Download
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {result.reports.errors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.reports.errors.map((entry, index) => (
                  <li key={index} className="text-[11px] text-amber-700">
                    {entry.kind}
                    {entry.groupId ? ` ${entry.groupId}` : ""}: {entry.error}
                  </li>
                ))}
              </ul>
            )}
          </ResultSection>
        </div>
      )}

      <ReportViewerModal
        open={Boolean(viewing)}
        onOpenChange={(next) => !next && setViewing(null)}
        fileUrl={viewing?.url ?? null}
        fileName={viewing?.fileName ?? "CLEAR-Report.pdf"}
        onDownload={() => {
          if (!viewing) return;
          const link = document.createElement("a");
          link.href = viewing.url;
          link.download = viewing.fileName;
          document.body.appendChild(link);
          link.click();
          link.remove();
        }}
      />
    </div>
  );
}

function ResultSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-[#E5E7EB] bg-[#FAFBFC] px-3 py-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#374151]">
        {title}
        <span className="ml-1.5 font-normal text-[#6B7280]">({count})</span>
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] italic text-[#9CA3AF]">{children}</p>;
}

function LienList({ records }: { records: ClearLienJudgmentRecord[] }) {
  if (records.length === 0) return <EmptyNote>None found.</EmptyNote>;

  return (
    <ul className="space-y-1.5">
      {records.map((record, index) => {
        const lines = [
          record.caseNumber ? `Case: ${record.caseNumber}` : null,
          record.court ? `Court: ${record.court}` : null,
          record.filingDate ? `Filed: ${record.filingDate}` : null,
          record.amount ? `Amount: ${record.amount}` : null,
          record.parties ? `Parties: ${record.parties}` : null,
          record.status ? `Status: ${record.status}` : null,
        ].filter(Boolean);

        return (
          <li
            key={`${record.groupId}-${record.caseNumber}-${index}`}
            className="rounded border border-[#E2E8F0] bg-white px-2.5 py-1.5"
          >
            <div className="flex flex-wrap items-center gap-x-2">
              <p className="text-xs font-medium text-[#0F172A]">{lienTitle(record)}</p>
              <span className="rounded bg-[#EFF6FF] px-1.5 py-0.5 text-[10px] font-medium text-[#1D4ED8]">
                CLEAR
              </span>
            </div>
            {lines.length > 0 && (
              <p className="mt-0.5 text-[11px] text-[#6B7280]">{lines.join(" · ")}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
