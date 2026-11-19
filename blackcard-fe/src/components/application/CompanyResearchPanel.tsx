import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { useDispatch } from "react-redux";
import { toast } from "react-toastify";
import type { AppDispatch } from "@/redux/store";
import { axiosPost } from "@/redux/axios";
import { getApplicationById } from "@/redux/actions/applicationActions";
import type { BackgroundCheck } from "@/redux/slices/backgroundCheckSlice";
import { extractApplicationBusinessSnapshotForClear } from "./clearComparison";
import type { CompanyBriefData } from "./backgroundCheckTypes";

/**
 * Company Research, at the top of the Background Check tab (as in mca-tool).
 *
 * The fields are the deal's business identity. They are prefilled from the
 * application, and anything corrected here is saved back to the application
 * when Research runs, so every background check (DataMerch, OpenCorporates,
 * Google, CLEAR...) reads the same values. A blank field never erases a stored
 * one. Gemini then searches the web and the brief is saved on the deal.
 */

type Identity = {
  businessName: string;
  address1: string;
  city: string;
  state: string;
  zipCode: string;
  ein: string;
  ownerName: string;
};

const CONFIDENCE: Record<string, { label: string; note: string; bg: string; border: string; text: string }> = {
  confirmed: {
    label: "Identity confirmed",
    note: "Name and address matched the sources found.",
    bg: "#f0fdf4",
    border: "#86efac",
    text: "#166534",
  },
  probable: {
    label: "Identity probable",
    note: "A likely match, not confirmed against the address. Read the findings with that in mind.",
    bg: "#fefce8",
    border: "#fde047",
    text: "#854d0e",
  },
  uncertain: {
    label: "Identity uncertain",
    note: "The business could not be confirmed. What follows may describe a different firm with a similar name.",
    bg: "#fff7ed",
    border: "#fdba74",
    text: "#9a3412",
  },
  not_found: {
    label: "Business not found online",
    note: "Nothing matching was found. For a business that is supposedly trading, that is itself worth noting.",
    bg: "#fef2f2",
    border: "#fca5a5",
    text: "#991b1b",
  },
};

function formatEin(value: string): string {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : "";
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  onEnter,
  className = "",
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
  className?: string;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1 block text-[11px] font-medium text-slate-600">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter?.();
          }
        }}
        placeholder={placeholder}
        className="w-full rounded-lg border bg-white px-3 py-2 text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none"
        style={{ borderColor: required && !value.trim() ? "#fca5a5" : "#E5E7EB" }}
      />
      {hint ? <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="text-[13px] leading-relaxed text-slate-800">{children}</div>
    </div>
  );
}

function BriefView({ brief }: { brief: CompanyBriefData }) {
  const conf = CONFIDENCE[brief.identityConfidence] ?? CONFIDENCE.uncertain;
  return (
    <div>
      <div
        className="mb-4 rounded-lg border px-3 py-2"
        style={{ backgroundColor: conf.bg, borderColor: conf.border, color: conf.text }}
      >
        <div className="text-[13px] font-bold">{conf.label}</div>
        <div className="text-[12px]">{conf.note}</div>
        {brief.researched ? (
          <div className="mt-0.5 text-[11px] opacity-80">
            Searched: {brief.researched.businessName}
            {brief.researched.address ? `, ${brief.researched.address}` : ""}
          </div>
        ) : null}
      </div>

      {brief.bottomLine ? <Section title="Bottom line">{brief.bottomLine}</Section> : null}
      {brief.companyProfile ? <Section title="Company profile">{brief.companyProfile}</Section> : null}
      {brief.onlinePresence ? <Section title="Online presence">{brief.onlinePresence}</Section> : null}
      {brief.reviewSummary ? <Section title="Reviews">{brief.reviewSummary}</Section> : null}

      {brief.negativeFindings?.length ? (
        <Section title={`Negative findings (${brief.negativeFindings.length})`}>
          <ul className="space-y-1.5">
            {brief.negativeFindings.map((finding, i) => (
              <li key={i} className="rounded border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1.5">
                <div>{finding.point}</div>
                <a
                  href={finding.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[#2563EB] hover:underline"
                >
                  {finding.title || hostOf(finding.url)}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="grid gap-x-6 sm:grid-cols-2">
        {brief.pros?.length ? (
          <Section title="Pros">
            <ul className="list-disc space-y-0.5 pl-4">
              {brief.pros.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Section>
        ) : null}
        {brief.cons?.length ? (
          <Section title="Cons">
            <ul className="list-disc space-y-0.5 pl-4">
              {brief.cons.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>

      {brief.sources?.length ? (
        <details className="mb-2 text-[11px] text-slate-500">
          <summary className="cursor-pointer select-none">Sources ({brief.sources.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {brief.sources.map((source, i) => (
              <li key={i}>
                [{i + 1}]{" "}
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#2563EB] hover:underline"
                >
                  {source.title || hostOf(source.url)}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-[11px] text-slate-400">
        AI research from public web pages. Check the linked sources before relying on a finding.
      </p>
    </div>
  );
}

type Props = {
  applicationData: Record<string, unknown> | null | undefined;
  applicationUuid: string;
  defaultOwnerName: string;
  brief?: CompanyBriefData | null;
  canRun: boolean;
  onResearched: (check: BackgroundCheck) => void;
};

const CompanyResearchPanel = ({
  applicationData,
  applicationUuid,
  defaultOwnerName,
  brief,
  canRun,
  onResearched,
}: Props) => {
  const dispatch = useDispatch<AppDispatch>();
  const snapshot = useMemo(() => extractApplicationBusinessSnapshotForClear(applicationData), [applicationData]);
  const fromApplication = useMemo<Identity>(
    () => ({
      businessName: snapshot.businessName,
      address1: snapshot.address1,
      city: snapshot.city,
      state: snapshot.state,
      zipCode: snapshot.zipCode,
      ein: snapshot.businessEinNumber,
      ownerName: defaultOwnerName,
    }),
    [snapshot, defaultOwnerName],
  );

  const [identity, setIdentity] = useState<Identity>(fromApplication);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Re-seed when the application changes (another panel saved new values),
  // so the inputs never hold stale values a search would then run on.
  useEffect(() => {
    setIdentity(fromApplication);
  }, [fromApplication]);

  const setField = (key: keyof Identity) => (v: string) => setIdentity((p) => ({ ...p, [key]: v }));

  const missing = [
    !identity.businessName.trim() && "Business name",
    !identity.address1.trim() && !identity.city.trim() && "Address",
  ].filter(Boolean) as string[];

  const run = async () => {
    if (busy || !canRun) return;
    if (missing.length) {
      setError(`Needed to research a business: ${missing.join(", ")}.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Gemini makes several searches; give it 5 minutes, not the usual 2.
      const res = await axiosPost(
        `/background-checks/application/${applicationUuid}/company-research`,
        identity,
        { timeout: 300000 },
      );
      const data = res.data?.data as { check: BackgroundCheck; updatedFields: string[] };
      onResearched(data.check);
      if (data.updatedFields?.length) {
        // The application changed: reload it so every check reads the new values.
        await dispatch(getApplicationById(applicationUuid));
        toast.success("Company research completed. Business details saved to the application.");
      } else {
        toast.success("Company research completed.");
      }
    } catch (e: any) {
      const message = e?.response?.data?.message || "Could not research this business.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const researchedAt = brief?.researchedAt ? new Date(brief.researchedAt) : null;

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-md">
      <div
        className="flex items-center justify-between gap-4 px-5 py-2.5 text-white"
        style={{ backgroundColor: "#7c3aed" }}
      >
        <div className="min-w-0">
          <div className="font-bold uppercase tracking-wide">Company Research</div>
          <div className="truncate text-[11px] opacity-90">
            Jaz searching · public record, filings and reviews
            {researchedAt ? ` · ${researchedAt.toLocaleDateString()}` : ""}
            {brief?.researchedBy ? ` · ${brief.researchedBy}` : ""}
          </div>
          {error ? (
            <div className="truncate text-[11px] text-amber-200" role="alert">
              {error}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canRun ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || missing.length > 0}
              className="rounded px-3 py-1.5 text-xs font-medium ring-1 ring-white/50 hover:bg-white/10 disabled:opacity-60"
            >
              {busy ? "Researching…" : brief ? "Run again" : "Research"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded px-3 py-1.5 text-xs font-medium ring-1 ring-white/50 hover:bg-white/10"
          >
            {open ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="p-5">
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field
              label="Business name"
              required
              value={identity.businessName}
              onChange={setField("businessName")}
              placeholder="Legal or trading name"
              onEnter={() => void run()}
              className="sm:col-span-2 lg:col-span-3"
            />
            <Field
              label="Street address"
              required
              value={identity.address1}
              onChange={setField("address1")}
              placeholder="372 S Eagle Rd #321"
              onEnter={() => void run()}
              className="sm:col-span-2 lg:col-span-3"
            />
            <Field
              label="City"
              value={identity.city}
              onChange={setField("city")}
              placeholder="Eagle"
              onEnter={() => void run()}
            />
            <Field
              label="State"
              value={identity.state}
              onChange={setField("state")}
              placeholder="ID"
              onEnter={() => void run()}
            />
            <Field
              label="ZIP"
              value={identity.zipCode}
              onChange={setField("zipCode")}
              placeholder="83616"
              onEnter={() => void run()}
            />
            <Field
              label="EIN"
              value={identity.ein}
              onChange={setField("ein")}
              placeholder="12-3456789"
              onEnter={() => void run()}
              hint={formatEin(identity.ein) || "Needed for DataMerch"}
            />
            <Field
              label="Owner name"
              value={identity.ownerName}
              onChange={setField("ownerName")}
              placeholder="Optional"
              onEnter={() => void run()}
              className="lg:col-span-2"
            />
          </div>

          {missing.length ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
              Still needed: <strong>{missing.join(", ")}</strong>. These are saved to the application and
              shared with every background check, so you only enter them once.
            </p>
          ) : (
            <p className="mb-3 text-[12px] text-slate-500">
              Saved to the application when you run Research and shared with every background check. Enter
              runs the search.
            </p>
          )}

          {busy ? (
            <p className="text-[13px] text-slate-600">Searching the public record, filings, licences and reviews…</p>
          ) : brief ? (
            <BriefView brief={brief} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default CompanyResearchPanel;
