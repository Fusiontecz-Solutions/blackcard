import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  FileText,
  // Sparkles,
  Search,
  ChevronDown,
} from "lucide-react";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/context/ThemeContext";
import { formatCurrency } from "@/lib/utils";
import { axiosGet } from "@/redux/axios";
import type { AppDispatch, RootState } from "@/redux/store";
import {
    getApplications,
    getApplicationsByIsoId,
    getApplicationsByUnderwriterId,
    updateApplication,
} from "@/redux/actions/applicationActions";
import { fetchUsersByRole } from "@/redux/actions/settingsUserActions";
import { clearIsoApplications, clearUnderwriterApplications } from "@/redux/slices/applicationSlice";
import { selectUsersByRole } from "@/redux/selectors/settingsUsersSelectors";
import type { GetApplicationsParams } from "@/types/applicationTypes";
import { CommissionRecipientToggle } from "./CommissionRecipientToggle";
import {
    type CommissionRecipientType,
    commissionPctPayloadField,
    getStoredCommissionAmountForRecipient,
    getStoredCommissionPctForRecipient,
    getUnderwriterNameFromApplication,
} from "./commissionRecipientShared";

type DealStatus = "APPROVED" | "PAID" | "PROCESSING" | "CLAWBACK";

type DealRow = {
  id: string;
  dealId: string | null;
  applicationNumber: string;
  merchant: string;
  offerAmount: number;
  fundedAmount: number;
  date: string;
  iso: string;
  status: DealStatus;
  statusLabel: string;
  base: number;
  upsell: number;
  fees: number;
  net: number;
  baseRatePct?: number;
  tier?: string;
  owner: string;
  ein: string;
  industry: string;
  agent: string;
  offerStatus: string;
  factor?: number;
  payback: number;
  daily: number;
  terms: string;
};

const DEFAULT_FACTOR_RATE = 1.499;

/** Keep parity with Applications list: prefer imported `dealId`, then business `applicationId`. */
function getDealIdDisplay(deal: DealRow): string {
  const raw = deal.dealId?.trim();
  if (raw) return raw;
  if (deal.applicationNumber.trim()) return deal.applicationNumber;
  return "-";
}

function toNum(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value).replace(/[^0-9.-]+/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "." || cleaned === "-.") {
    return null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toDisplayName(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const person = value as {
      firstName?: string;
      lastName?: string;
      name?: string;
      fullName?: string;
    };
    if (person.fullName) return person.fullName;
    if (person.name) return person.name;
    const combined = [person.firstName, person.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return combined || null;
  }
  return null;
}

function mapQueueToDealStatus(app: Record<string, unknown>): DealStatus {
  const queue = app?.currentQueue as string | undefined;
  const state = app?.currentState as string | undefined;
  if (queue === "Approved" && state === "Completed") return "PAID";
  if (queue === "Approved") return "APPROVED";
  if (queue === "Declined") return "CLAWBACK";
  return "PROCESSING";
}

function getQueueStatusLabel(app: Record<string, unknown>): string {
  const queue = (app?.currentQueue as string | undefined)?.trim();
  return queue || "Processing";
}

function mapApplicationToDealRow(
  app: unknown,
  isoName: string,
  rowIndex: number,
  recipientType: CommissionRecipientType = "iso",
): DealRow {
  const r = app as Record<string, unknown>;
  const offerDecisionRaw = r?.OfferDecision as Record<string, unknown> | undefined;
  const nestedOfferDecision =
    offerDecisionRaw?.offer &&
      typeof offerDecisionRaw.offer === "object" &&
      !Array.isArray(offerDecisionRaw.offer)
      ? (offerDecisionRaw.offer as Record<string, unknown>)
      : null;
  // Keep parity with Transactions: prefer bank-analysis/offer-decision values first.
  const sourceOfferDecision = nestedOfferDecision ?? offerDecisionRaw ?? null;
  const termOffers = r?.termsOffers as unknown[] | undefined;
  const latestTermsOffer =
    Array.isArray(termOffers) && termOffers.length > 0
      ? (termOffers[0] as Record<string, unknown>)
      : null;
  const latestTermsOfferNested =
    latestTermsOffer?.offer &&
      typeof latestTermsOffer.offer === "object" &&
      !Array.isArray(latestTermsOffer.offer)
      ? (latestTermsOffer.offer as Record<string, unknown>)
      : null;

  const fundedAmount =
    toNum(sourceOfferDecision?.offer) ??
    toNum(sourceOfferDecision?.approvedAmount) ??
    toNum(latestTermsOfferNested?.offer) ??
    toNum(latestTermsOfferNested?.approvedAmount) ??
    toNum(latestTermsOffer?.approvedAmount) ??
    toNum(r?.loanAmount) ??
    0;
  const offerAmount = fundedAmount;

  const commissionAmount =
    getStoredCommissionAmountForRecipient(r, recipientType) ??
    toNum(sourceOfferDecision?.commissionAmount) ??
    toNum(sourceOfferDecision?.commission) ??
    (recipientType === "underwriter" ? null : toNum(r?.commissionAmount)) ??
    0;

  const storedPctRaw = getStoredCommissionPctForRecipient(r, recipientType);
  const derivedPct =
    fundedAmount > 0 && commissionAmount !== 0
      ? Math.round((commissionAmount / fundedAmount) * 10000) / 100
      : undefined;

  let baseRatePct: number | undefined;
  let base: number;
  if (storedPctRaw != null && storedPctRaw > 0) {
    baseRatePct = Math.min(
      100,
      Math.max(0, Math.round(storedPctRaw * 100) / 100),
    );
    base = Math.round((fundedAmount * baseRatePct) / 100);
  } else if (derivedPct != null) {
    baseRatePct = derivedPct;
    base = commissionAmount;
  } else if (storedPctRaw === 0) {
    baseRatePct = 0;
    base = 0;
  } else {
    base = commissionAmount;
    baseRatePct = undefined;
  }

  const upsell = 0;
  const fees = 0;
  const net = base + upsell + fees;

  const client = r?.client as Record<string, unknown> | undefined;
  const business = client?.business as Record<string, unknown> | undefined;
  const created = r?.createdAt ? new Date(String(r.createdAt)) : null;
  const date =
    created && !Number.isNaN(created.getTime())
      ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`
      : "—";

  const merchant =
    (business?.name as string | undefined) ||
    (client?.businessName as string | undefined) ||
    `Application #${r?.applicationId ?? r?.id ?? "—"}`;

  const ownerObj =
    (r?.owner as Record<string, unknown> | undefined) ??
    (client?.owner as Record<string, unknown> | undefined);
  const owner =
    (r?.ownerName as string | undefined) ||
    toDisplayName(ownerObj) ||
    "N/A";

  const agentObj = r?.agent as Record<string, unknown> | undefined;
  const agent =
    (r?.agentName as string | undefined) ||
    toDisplayName(agentObj) ||
    toDisplayName(r?.referringAgent) ||
    toDisplayName(r?.salesRepresentative) ||
    "N/A";

  const ein =
    (business?.einNumber as string | undefined) ||
    (business?.ein as string | undefined) ||
    (business?.taxId as string | undefined) ||
    (r?.ein as string | undefined) ||
    "N/A";

  const industry =
    (business?.businessEntityType as string | undefined) ||
    (business?.industry as string | undefined) ||
    (r?.industry as string | undefined) ||
    "N/A";

  const offerStatus =
    (sourceOfferDecision?.decision as string | undefined) ||
    (sourceOfferDecision?.status as string | undefined) ||
    (sourceOfferDecision?.offerDecision as string | undefined) ||
    (sourceOfferDecision?.offer_status as string | undefined) ||
    (latestTermsOffer?.status as string | undefined) ||
    (r?.currentQueue as string | undefined) ||
    "—";

  const factorRaw =
    toNum(sourceOfferDecision?.rate) ??
    toNum(sourceOfferDecision?.factorRate) ??
    toNum(sourceOfferDecision?.factor) ??
    toNum(latestTermsOfferNested?.rate) ??
    toNum(latestTermsOfferNested?.factorRate) ??
    toNum(latestTermsOfferNested?.factor) ??
    toNum(latestTermsOffer?.factorRate) ??
    toNum(latestTermsOffer?.factor) ??
    0;
  const factor =
    Number.isFinite(factorRaw) && factorRaw > 0 ? factorRaw : DEFAULT_FACTOR_RATE;

  const payback =
    toNum(sourceOfferDecision?.paybackAmount) ??
    toNum(sourceOfferDecision?.totalRepayments) ??
    toNum(sourceOfferDecision?.totalRepayment) ??
    toNum(latestTermsOfferNested?.paybackAmount) ??
    toNum(latestTermsOfferNested?.totalRepayments) ??
    toNum(latestTermsOfferNested?.totalRepayment) ??
    toNum(latestTermsOffer?.paybackAmount) ??
    toNum(latestTermsOffer?.payback) ??
    (factor != null ? fundedAmount * factor : 0);

  const daily =
    toNum(sourceOfferDecision?.paymentAmount) ??
    toNum(sourceOfferDecision?.repayPerPeriod) ??
    toNum(sourceOfferDecision?.daysWeeks) ??
    toNum(latestTermsOfferNested?.paymentAmount) ??
    toNum(latestTermsOfferNested?.repayPerPeriod) ??
    toNum(latestTermsOfferNested?.daysWeeks) ??
    toNum(latestTermsOffer?.dailyPayment) ??
    toNum(latestTermsOffer?.paymentAmount) ??
    toNum(latestTermsOffer?.achPayment) ??
    0;

  const termsRaw =
    latestTermsOffer?.term ??
    latestTermsOffer?.terms ??
    latestTermsOffer?.numberOfPayments;
  const terms = termsRaw != null ? String(termsRaw) : "—";

  const id = String(r?.id ?? r?._id ?? r?.applicationId ?? `deal-${rowIndex}`);
  const applicationNumber = String(r?.applicationId ?? rowIndex + 1);

  return {
    id,
    dealId: r?.dealId == null ? null : String(r.dealId),
    applicationNumber,
    merchant,
    offerAmount,
    fundedAmount,
    date,
    iso: isoName,
    status: mapQueueToDealStatus(r),
    statusLabel: getQueueStatusLabel(r),
    base,
    upsell,
    fees,
    net,
    baseRatePct,
    tier: undefined,
    owner,
    ein,
    industry,
    agent,
    offerStatus,
    factor,
    payback,
    daily,
    terms,
  };
}

function applyCommissionRate(deal: DealRow, baseRatePct: number): DealRow {
  const clamped = Math.min(100, Math.max(0, baseRatePct));
  const base = Math.round((deal.fundedAmount * clamped) / 100);
  const net = base + deal.upsell + deal.fees;
  return { ...deal, baseRatePct: clamped, base, net };
}

function parseFundedForFormula(
  fundedAmount: number,
  baseRatePct: number | undefined,
  actualBase: number,
) {
  const pct = baseRatePct ?? 10;
  const expectedBase = Math.round((fundedAmount * pct) / 100);
  const delta = expectedBase - actualBase;
  if (Math.abs(delta) < 2) {
    return {
      line: `${formatCurrency(fundedAmount)} × ${pct}%`,
      value: expectedBase,
    };
  }
  return {
    line: `${formatCurrency(fundedAmount)} at tier rate`,
    value: actualBase,
  };
}

function getIsoNameFromApplication(app: unknown): string {
  const r = app as Record<string, unknown>;
  const iso = r?.iso as Record<string, unknown> | undefined;
  return String(
    (iso?.name as string | undefined) ??
    (r?.isoName as string | undefined) ??
    "—",
  );
}

function getApplicationIdentifiers(app: unknown): string[] {
  const r = app as Record<string, unknown>;
  return [r?.id, r?._id, r?.applicationId]
    .map((v) => (v == null ? "" : String(v).trim()))
    .filter((v): v is string => v.length > 0);
}

/** Prefer numeric `applicationId` for PUT `/applications/:id` when present. */
function getApplicationPutId(app: unknown): string | null {
  const r = app as Record<string, unknown>;
  if (r?.applicationId != null && String(r.applicationId).trim() !== "") {
    return String(r.applicationId);
  }
  const id = r?.id ?? r?._id;
  if (id != null && String(id).trim() !== "") return String(id);
  return null;
}

const queueFilterOptions = [
  "All",
  "Agent",
  "Scrubbing",
  "Underwriter",
  "Contract",
  "Final",
  "Funding call",
  "Disbursement",
  "Funded",
] as const;

export default function DealDetails() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const dispatch = useDispatch<AppDispatch>();
  const isos = useSelector((state: RootState) => state.iso.list || []);
  const allApplications = useSelector(
    (state: RootState) => state.applications.data || [],
  );
  const allApplicationsLoading = useSelector(
    (state: RootState) =>
      state.applications.loading || state.applications.isRefreshing,
  );
  const allApplicationsError = useSelector(
    (state: RootState) => state.applications.error,
  );
  const isoApplications = useSelector(
    (state: RootState) => state.isoApplications.data || [],
  );
  const isoApplicationsLoading = useSelector(
    (state: RootState) => state.isoApplications.loading,
  );
  const isoApplicationsError = useSelector(
    (state: RootState) => state.isoApplications.error,
  );
  const underwriterApplications = useSelector(
    (state: RootState) => state.underwriterApplications.data || [],
  );
  const underwriterApplicationsLoading = useSelector(
    (state: RootState) => state.underwriterApplications.loading,
  );
  const underwriterApplicationsError = useSelector(
    (state: RootState) => state.underwriterApplications.error,
  );
  const underwriters = useSelector((state: RootState) =>
    selectUsersByRole(state, "UNDERWRITER"),
  );

  /** Filters the deal list by ISO vs underwriter attribution (not per-deal commission editing). */
  const [listFilterRecipient, setListFilterRecipient] =
    useState<CommissionRecipientType>("iso");
  /** Per-deal ISO vs underwriter commission view on the selected deal card. */
  const [dealRecipientById, setDealRecipientById] = useState<
    Record<string, CommissionRecipientType>
  >({});
  const [selectedIsoId, setSelectedIsoId] = useState<string>("all");
  const [selectedUnderwriterId, setSelectedUnderwriterId] = useState<string>("all");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [commissionDraft, setCommissionDraft] = useState("");
  /** Last saved % for the selected deal; not updated while typing (unlike deal row). */
  const [commissionBaselinePct, setCommissionBaselinePct] = useState<
    number | null
  >(null);
  const [savingCommission, setSavingCommission] = useState(false);
  const commissionSelectionKeyRef = useRef<string>("");
  const [dealSearch, setDealSearch] = useState("");
  const [debouncedDealSearch, setDebouncedDealSearch] = useState("");
  const [selectedQueueFilter, setSelectedQueueFilter] = useState<string>("All");
  const [isoSearch, setIsoSearch] = useState("");
  const [isoDropdownOpen, setIsoDropdownOpen] = useState(false);
  const [underwriterSearch, setUnderwriterSearch] = useState("");
  const [underwriterDropdownOpen, setUnderwriterDropdownOpen] = useState(false);
  const [selectedOfferDecisionData, setSelectedOfferDecisionData] = useState<
    Record<string, unknown> | null
  >(null);
  const [isOfferDecisionLoading, setIsOfferDecisionLoading] = useState(false);
  const isoDropdownRef = useRef<HTMLDivElement | null>(null);
  const underwriterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void dispatch(fetchUsersByRole("UNDERWRITER"));
  }, [dispatch]);

  const isoAgentOptions = useMemo(
    () =>
      (isos as { id?: string; _id?: string; name?: string }[])
        .map((iso) => {
          const isoId = iso.id ?? iso._id;
          if (!isoId) return null;
          return {
            id: String(isoId),
            name: String(iso.name || "Unnamed ISO"),
          };
        })
        .filter((iso): iso is { id: string; name: string } => iso !== null),
    [isos],
  );

  const selectedIsoName =
    isoAgentOptions.find((x) => x.id === selectedIsoId)?.name || "—";

  const underwriterOptions = useMemo(
    () =>
      underwriters
        .map((uw) => {
          const id = uw._id ?? (uw as { id?: string }).id;
          if (!id) return null;
          const name =
            [uw.firstName, uw.lastName].filter(Boolean).join(" ").trim() ||
            uw.email ||
            "Unnamed underwriter";
          return { id: String(id), name };
        })
        .filter((uw): uw is { id: string; name: string } => uw !== null)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [underwriters],
  );

  const selectedUnderwriterName =
    underwriterOptions.find((x) => x.id === selectedUnderwriterId)?.name || "—";

  const filteredIsoOptions = useMemo(() => {
    const q = isoSearch.trim().toLowerCase();
    if (!q) return isoAgentOptions;
    return isoAgentOptions.filter((iso) => iso.name.toLowerCase().includes(q));
  }, [isoAgentOptions, isoSearch]);

  const filteredUnderwriterOptions = useMemo(() => {
    const q = underwriterSearch.trim().toLowerCase();
    if (!q) return underwriterOptions;
    return underwriterOptions.filter((uw) =>
      uw.name.toLowerCase().includes(q),
    );
  }, [underwriterOptions, underwriterSearch]);

  const selectedRecipientId =
    listFilterRecipient === "iso" ? selectedIsoId : selectedUnderwriterId;

  const sourceApplications =
    selectedRecipientId === "all"
      ? allApplications
      : listFilterRecipient === "iso"
        ? isoApplications
        : underwriterApplications;
  const isListLoading =
    selectedRecipientId === "all"
      ? allApplicationsLoading
      : listFilterRecipient === "iso"
        ? isoApplicationsLoading
        : underwriterApplicationsLoading;
  const listError =
    selectedRecipientId === "all"
      ? allApplicationsError
      : listFilterRecipient === "iso"
        ? isoApplicationsError
        : underwriterApplicationsError;

  const mappedDeals = useMemo(() => {
    return sourceApplications.map((app, index) =>
      mapApplicationToDealRow(
        app,
        listFilterRecipient === "iso"
          ? selectedIsoId === "all"
            ? getIsoNameFromApplication(app)
            : selectedIsoName
          : selectedUnderwriterId === "all"
            ? getUnderwriterNameFromApplication(app)
            : selectedUnderwriterName,
        index,
        "iso",
      ),
    );
  }, [
    sourceApplications,
    selectedIsoId,
    selectedIsoName,
    selectedUnderwriterId,
    selectedUnderwriterName,
    listFilterRecipient,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedDealSearch(dealSearch.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dealSearch]);

  useEffect(() => {
    if (listFilterRecipient === "iso") {
      if (selectedIsoId === "all") {
        dispatch(clearIsoApplications());
        const listParams: GetApplicationsParams = {
          page: 1,
          limit: 1000,
          search: debouncedDealSearch || undefined,
          currentQueue:
            selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
          skipListCache: true,
        };
        dispatch(getApplications(listParams));
        return;
      }
      dispatch(
        getApplicationsByIsoId({
          isoId: selectedIsoId,
          search: debouncedDealSearch,
          currentQueue:
            selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
        }),
      );
      return;
    }

    if (selectedUnderwriterId === "all") {
      dispatch(clearUnderwriterApplications());
      const listParams: GetApplicationsParams = {
        page: 1,
        limit: 1000,
        search: debouncedDealSearch || undefined,
        currentQueue:
          selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
        skipListCache: true,
      };
      dispatch(getApplications(listParams));
      return;
    }
    dispatch(
      getApplicationsByUnderwriterId({
        underwriterId: selectedUnderwriterId,
        search: debouncedDealSearch,
        currentQueue:
          selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
      }),
    );
  }, [
    listFilterRecipient,
    debouncedDealSearch,
    dispatch,
    selectedIsoId,
    selectedUnderwriterId,
    selectedQueueFilter,
  ]);

  useLayoutEffect(() => {
    if (isListLoading) {
      return;
    }
    setDeals(mappedDeals);
    setSelectedId((prev) =>
      prev && mappedDeals.some((d) => d.id === prev)
        ? prev
        : (mappedDeals[0]?.id ?? ""),
    );
  }, [isListLoading, mappedDeals]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isoDropdownRef.current &&
        !isoDropdownRef.current.contains(event.target as Node)
      ) {
        setIsoDropdownOpen(false);
      }
      if (
        underwriterDropdownRef.current &&
        !underwriterDropdownRef.current.contains(event.target as Node)
      ) {
        setUnderwriterDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedRecipientId === "all") return;
    if (deals.length === 0) {
      setSelectedId("");
      return;
    }
    if (!deals.some((deal) => deal.id === selectedId)) {
      setSelectedId(deals[0].id);
    }
  }, [deals, selectedId, selectedRecipientId]);

  const selectedDeal = useMemo(() => {
    if (!deals.length) return null;
    return deals.find((d) => d.id === selectedId) ?? deals[0] ?? null;
  }, [deals, selectedId]);
  const selectedApplication = useMemo(() => {
    if (!selectedDeal) return null;
    return (
      sourceApplications.find((app) => {
        const ids = getApplicationIdentifiers(app);
        return (
          ids.includes(selectedDeal.id) ||
          ids.includes(selectedDeal.applicationNumber)
        );
      }) ?? null
    );
  }, [selectedDeal, sourceApplications]);

  const selectedDealRecipient: CommissionRecipientType = selectedId
    ? (dealRecipientById[selectedId] ?? "iso")
    : "iso";

  const selectedDealCommissionView = useMemo(() => {
    if (!selectedDeal || !selectedApplication) return selectedDeal;
    const remapped = mapApplicationToDealRow(
      selectedApplication,
      selectedDeal.iso,
      0,
      selectedDealRecipient,
    );
    return {
      ...remapped,
      id: selectedDeal.id,
      dealId: selectedDeal.dealId,
      applicationNumber: selectedDeal.applicationNumber,
    };
  }, [selectedDeal, selectedApplication, selectedDealRecipient]);

  const displayedDealForCommission = useMemo(() => {
    if (!selectedDealCommissionView) return null;
    if (commissionDraft === "" || commissionDraft === "-") {
      return selectedDealCommissionView;
    }
    const n = parseFloat(commissionDraft);
    if (Number.isNaN(n)) return selectedDealCommissionView;
    return applyCommissionRate(selectedDealCommissionView, n);
  }, [selectedDealCommissionView, commissionDraft]);

  useEffect(() => {
    const d = selectedDealCommissionView;
    const pct = d?.baseRatePct ?? null;
    const draftStr = pct != null ? String(pct) : "";
    const selectionKey = `${selectedId}:${selectedDealRecipient}`;

    if (commissionSelectionKeyRef.current !== selectionKey) {
      commissionSelectionKeyRef.current = selectionKey;
      setCommissionDraft(draftStr);
      setCommissionBaselinePct(pct);
    } else if (d && d.baseRatePct != null) {
      setCommissionDraft(String(d.baseRatePct));
    } else {
      setCommissionDraft("");
    }
  }, [selectedId, selectedDealRecipient, selectedDealCommissionView]);

  useEffect(() => {
    const loadOfferDecision = async () => {
      if (!selectedApplication) {
        setSelectedOfferDecisionData(null);
        setIsOfferDecisionLoading(false);
        return;
      }

      const applicationIds = getApplicationIdentifiers(selectedApplication);
      if (applicationIds.length === 0) {
        setSelectedOfferDecisionData(null);
        setIsOfferDecisionLoading(false);
        return;
      }

      setIsOfferDecisionLoading(true);
      try {
        let apiData: Record<string, unknown> | null = null;
        const results = await Promise.all(
          applicationIds.map(async (candidateId) => {
            try {
              const res = await axiosGet("/offer-decisions", {
                params: { application: candidateId },
              });
              return {
                candidateId,
                data: (res.data?.data ?? null) as Record<string, unknown> | null,
              };
            } catch {
              return { candidateId, data: null as Record<string, unknown> | null };
            }
          }),
        );
        const byId = new Map(results.map((r) => [r.candidateId, r.data]));
        for (const candidateId of applicationIds) {
          const row = byId.get(candidateId);
          if (row) {
            apiData = row;
            break;
          }
        }
        setSelectedOfferDecisionData(apiData);
      } catch (error) {
        console.error("[DealDetails] Failed to load offer decision:", error);
        setSelectedOfferDecisionData(null);
      } finally {
        setIsOfferDecisionLoading(false);
      }
    };

    void loadOfferDecision();
  }, [selectedApplication]);

  const breakdown = useMemo(() => {
    const dealForBreakdown = displayedDealForCommission ?? selectedDealCommissionView;
    if (!dealForBreakdown) {
      return {
        baseLabel: "",
        baseAmount: 0,
        upsell: 0,
        fees: 0,
        net: 0,
      };
    }
    const baseInfo = parseFundedForFormula(
      dealForBreakdown.fundedAmount,
      dealForBreakdown.baseRatePct,
      dealForBreakdown.base,
    );
    return {
      baseLabel: baseInfo.line,
      baseAmount: dealForBreakdown.base,
      upsell: dealForBreakdown.upsell,
      fees: dealForBreakdown.fees,
      net: dealForBreakdown.net,
    };
  }, [displayedDealForCommission, selectedDealCommissionView]);

  const netPositive = selectedDeal ? breakdown.net >= 0 : true;
  const initial = selectedDeal
    ? selectedDeal.merchant.trim().charAt(0).toUpperCase()
    : "?";
  const applicationCardData = useMemo(() => {
    if (!selectedDeal) {
      return {
        subtitle: "—",
        rows: [] as [string, string, boolean?][],
      };
    }
    return {
      subtitle: getDealIdDisplay(selectedDeal),
      rows: [
        // ["Business", selectedDeal.merchant, true],
        ["Owner", selectedDeal.owner],
        ["EIN", selectedDeal.ein],
        ["Agent", selectedDeal.agent],
        ["Industry", selectedDeal.industry],
        [
          selectedDealRecipient === "underwriter" ? "Underwriter" : "ISO",
          selectedDealRecipient === "underwriter"
            ? getUnderwriterNameFromApplication(selectedApplication)
            : selectedDeal.iso,
        ],
      ] as [string, string, boolean?][],
    };
  }, [selectedDeal, selectedApplication, selectedDealRecipient]);

  const fundingCardData = useMemo(() => {
    if (!selectedDeal) {
      return [] as [string, string, boolean?][];
    }
    const selectedAppRecord =
      (selectedApplication as Record<string, unknown> | null) ?? null;
    const selectedTermsOffers = selectedAppRecord?.termsOffers as
      | unknown[]
      | undefined;
    const latestTermsOffer =
      Array.isArray(selectedTermsOffers) && selectedTermsOffers.length > 0
        ? (selectedTermsOffers[0] as Record<string, unknown>)
        : null;
    const inlineOfferDecision =
      (selectedAppRecord?.OfferDecision as Record<string, unknown> | undefined) ??
      null;
    const sourceOfferDecision = (selectedOfferDecisionData ??
      inlineOfferDecision) as Record<string, unknown> | null;

    const approvedAmount =
      toNum(sourceOfferDecision?.offer) ??
      toNum(sourceOfferDecision?.approvedAmount) ??
      toNum(latestTermsOffer?.approvedAmount) ??
      selectedDeal.fundedAmount;
    const factorRate =
      toNum(sourceOfferDecision?.rate) ??
      toNum(sourceOfferDecision?.factorRate) ??
      toNum(latestTermsOffer?.factorRate) ??
      selectedDeal.factor ??
      DEFAULT_FACTOR_RATE;
    const paybackAmount =
      toNum(sourceOfferDecision?.paybackAmount) ??
      toNum(sourceOfferDecision?.totalRepayments) ??
      toNum(sourceOfferDecision?.totalRepayment) ??
      toNum(latestTermsOffer?.paybackAmount) ??
      (approvedAmount != null && factorRate != null
        ? approvedAmount * factorRate
        : null) ??
      selectedDeal.payback;
    const paymentAmount =
      toNum(sourceOfferDecision?.paymentAmount) ??
      toNum(sourceOfferDecision?.repayPerPeriod) ??
      toNum(sourceOfferDecision?.daysWeeks) ??
      toNum(latestTermsOffer?.paymentAmount) ??
      selectedDeal.daily;
    const frequency = String(
      sourceOfferDecision?.frequency ?? latestTermsOffer?.frequency ?? "",
    ).toLowerCase();
    const dailyAmount =
      paymentAmount != null && frequency === "daily"
        ? paymentAmount
        : (selectedDeal.daily ?? paymentAmount ?? 0);
    // const offerLabel =
    //   String(
    //     sourceOfferDecision?.decision ??
    //       sourceOfferDecision?.status ??
    //       sourceOfferDecision?.offerDecision ??
    //       sourceOfferDecision?.offer_status ??
    //       selectedDeal.offerStatus,
    //   ) || "—";

    return [
      // ["Offer", isOfferDecisionLoading ? "Loading..." : offerLabel],
      [
        "Factor",
        factorRate != null ? factorRate.toFixed(3) : "N/A",
      ],
      ["Advance", formatCurrency(approvedAmount), true],
      ["Daily", formatCurrency(dailyAmount), true],
      ["Payback", formatCurrency(paybackAmount), true],
      // ["Terms", selectedDeal.terms],
      ["Deal status", selectedDeal.statusLabel],
    ] as [string, string, boolean?][];
  }, [selectedDeal, selectedApplication, selectedOfferDecisionData, isOfferDecisionLoading]);

  /**
   * Enable Update only when the draft is a valid positive % and differs from
   * `commissionBaselinePct` (last loaded/saved value for this deal — not the live row,
   * which updates on every keystroke).
   */
  const canSaveCommissionDraft = useMemo(() => {
    const s = commissionDraft.trim();
    if (s === "" || s === "-") return false;
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0 || n > 100) return false;
    if (
      commissionBaselinePct != null &&
      Number.isFinite(commissionBaselinePct) &&
      Math.abs(n - commissionBaselinePct) < 1e-6
    ) {
      return false;
    }
    return true;
  }, [commissionDraft, commissionBaselinePct]);

  const handleSaveCommission = async () => {
    if (!selectedDeal || !selectedApplication || !selectedDealCommissionView) return;
    if (commissionDraft === "" || commissionDraft === "-") {
      toast.error("Enter a commission rate.");
      return;
    }
    const n = parseFloat(commissionDraft);
    if (Number.isNaN(n)) {
      toast.error("Enter a valid commission rate.");
      return;
    }
    if (n <= 0) {
      toast.error("Enter a commission rate greater than 0%.");
      return;
    }
    if (n > 100) {
      toast.error("Commission rate cannot exceed 100%.");
      return;
    }
    const putId = getApplicationPutId(selectedApplication);
    if (!putId) {
      toast.error("Could not resolve application id.");
      return;
    }
    const updated = applyCommissionRate(selectedDealCommissionView, n);
    if (updated.baseRatePct != null)
      setCommissionDraft(String(updated.baseRatePct));

    const listParamsAll = {
      page: 1,
      limit: 1000,
      search: debouncedDealSearch || undefined,
      currentQueue:
        selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
      skipListCache: true,
    } as const satisfies GetApplicationsParams;
    const listParamsIso = {
      isoId: selectedIsoId,
      search: debouncedDealSearch,
      currentQueue:
        selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
    } as const;
    const listParamsUnderwriter = {
      underwriterId: selectedUnderwriterId,
      search: debouncedDealSearch,
      currentQueue:
        selectedQueueFilter !== "All" ? selectedQueueFilter : undefined,
    } as const;
    const pctField = commissionPctPayloadField(selectedDealRecipient);

    setSavingCommission(true);
    try {
      await dispatch(
        updateApplication({
          id: putId,
          data: { [pctField]: updated.baseRatePct ?? n },
        }),
      ).unwrap();
      if (selectedRecipientId === "all") {
        await dispatch(getApplications(listParamsAll)).unwrap();
      } else if (listFilterRecipient === "iso") {
        await dispatch(getApplicationsByIsoId(listParamsIso)).unwrap();
      } else {
        await dispatch(getApplicationsByUnderwriterId(listParamsUnderwriter)).unwrap();
      }
      setCommissionBaselinePct(updated.baseRatePct ?? n);
      toast.success(
        `${selectedDealRecipient === "underwriter" ? "Underwriter" : "ISO"} commission rate saved.`,
      );
    } catch (err: unknown) {
      const msg =
        typeof err === "string"
          ? err
          : "Failed to save commission rate.";
      toast.error(msg);
      try {
        if (selectedRecipientId === "all") {
          await dispatch(getApplications(listParamsAll)).unwrap();
        } else if (listFilterRecipient === "iso") {
          await dispatch(getApplicationsByIsoId(listParamsIso)).unwrap();
        } else {
          await dispatch(getApplicationsByUnderwriterId(listParamsUnderwriter)).unwrap();
        }
      } catch {
        /* ignore re-fetch errors */
      }
    } finally {
      setSavingCommission(false);
    }
  };

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border bg-card p-6 shadow-md ${isDark ? "border-[#2D3B4F]" : "border-border"
          }`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.22em] text-muted-foreground">
              {/* <Sparkles className="h-3.5 w-3.5 text-[#49A8E8]" /> */}
              COMMISSION PORTAL
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Deal details
            </h1>
            {/* <p className="max-w-xl text-sm text-muted-foreground">
              Browse funded deals, attribution, and a live payout breakdown in
              one glance.
            </p> */}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="flex min-w-[220px] flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Show deals for
              </span>
              <CommissionRecipientToggle
                value={listFilterRecipient}
                onChange={(next) => {
                  setListFilterRecipient(next);
                  setSelectedIsoId("all");
                  setSelectedUnderwriterId("all");
                  setDealSearch("");
                }}
              />
            </div>
            {listFilterRecipient === "iso" ? (
              <div className="flex min-w-[220px] flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filter by ISO
                </span>
                <div className="relative" ref={isoDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsoDropdownOpen((prev) => !prev)}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <span className="truncate">
                      {selectedIsoId === "all" ? "All ISOs" : selectedIsoName}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  {isoDropdownOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-md border border-input bg-background p-2 shadow-lg">
                      <div className="relative mb-2">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={isoSearch}
                          onChange={(e) => setIsoSearch(e.target.value)}
                          placeholder="Search ISO..."
                          className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-[var(--brand)]/25"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedIsoId("all");
                          setIsoDropdownOpen(false);
                        }}
                        className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs ${selectedIsoId === "all"
                          ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                          : "text-foreground hover:bg-muted"
                          }`}
                      >
                        All ISOs
                      </button>
                      <div className="max-h-44 overflow-y-auto">
                        {filteredIsoOptions.length > 0 ? (
                          filteredIsoOptions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedIsoId(item.id);
                                setDealSearch("");
                                setIsoDropdownOpen(false);
                              }}
                              className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs ${selectedIsoId === item.id
                                ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                                : "text-foreground hover:bg-muted"
                                }`}
                            >
                              {item.name}
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-2 text-xs text-muted-foreground">
                            No ISO found.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex min-w-[220px] flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Filter by underwriter
                </span>
                <div className="relative" ref={underwriterDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setUnderwriterDropdownOpen((prev) => !prev)}
                    className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <span className="truncate">
                      {selectedUnderwriterId === "all"
                        ? "All underwriters"
                        : selectedUnderwriterName}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                  {underwriterDropdownOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-md border border-input bg-background p-2 shadow-lg">
                      <div className="relative mb-2">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          value={underwriterSearch}
                          onChange={(e) => setUnderwriterSearch(e.target.value)}
                          placeholder="Search underwriter..."
                          className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-xs outline-none focus:ring-2 focus:ring-[var(--brand)]/25"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUnderwriterId("all");
                          setUnderwriterDropdownOpen(false);
                        }}
                        className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs ${selectedUnderwriterId === "all"
                          ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                          : "text-foreground hover:bg-muted"
                          }`}
                      >
                        All underwriters
                      </button>
                      <div className="max-h-44 overflow-y-auto">
                        {filteredUnderwriterOptions.length > 0 ? (
                          filteredUnderwriterOptions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => {
                                setSelectedUnderwriterId(item.id);
                                setDealSearch("");
                                setUnderwriterDropdownOpen(false);
                              }}
                              className={`mb-1 block w-full rounded px-2 py-1.5 text-left text-xs ${selectedUnderwriterId === item.id
                                ? "bg-[var(--brand)]/10 text-[var(--brand)]"
                                : "text-foreground hover:bg-muted"
                                }`}
                            >
                              {item.name}
                            </button>
                          ))
                        ) : (
                          <p className="px-2 py-2 text-xs text-muted-foreground">
                            No underwriter found.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className="flex min-w-[220px] flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Search deal
              </span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={dealSearch}
                  onChange={(e) => setDealSearch(e.target.value)}
                  placeholder="Search by merchant name..."
                  className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--brand)]/25"
                />
              </div>
            </div>
            {/* <div
              className={`flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 backdrop-blur-md ${
                isDark
                  ? "border-[#3A4A5F] bg-[#0F172A]/55"
                  : "border-[#D6E4F1] bg-white/80"
              }`}
            >
              <Gauge className="h-4 w-4 text-[var(--brand)]" />
              <span className="text-xs font-medium text-muted-foreground">
                {`${deals.length} deals · ${deals.filter((d) => d.status === "PAID").length} paid`}
              </span>
            </div> */}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start">
        <section
          className={`overflow-hidden rounded-2xl border bg-card shadow-lg ${isDark ? "border-[#324154]" : "border-[#E2ECF4]"
            }`}
        >
          <header
            className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? "border-[#283347] bg-card" : "border-[#E8F0F8] bg-card"
              }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--brand)]/15 text-[var(--brand)]">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-md font-semibold text-foreground">
                  All Deals
                </h2>
                {/* <p className="text-[11px] text-muted-foreground">Tap a deal to inspect payout math</p> */}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <select
                  value={selectedQueueFilter}
                  onChange={(e) => setSelectedQueueFilter(e.target.value)}
                  className={`h-9 appearance-none rounded-lg border pl-3 pr-9 text-xs font-medium text-foreground shadow-sm transition-all duration-200 outline-none ${isDark
                    ? "border-[#3A4A5F] bg-[#111827] hover:border-[#4A607A] focus:border-[#5B9FD1] focus:ring-2 focus:ring-[var(--brand)]/25"
                    : "border-[#D5E3F0] bg-white hover:border-[#B6CEE3] focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/20"
                    }`}
                  aria-label="Filter deals by queue"
                >
                  {queueFilterOptions.map((queue) => (
                    <option key={queue} value={queue}>
                      {queue}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${isDark
                  ? "bg-slate-800/80 text-slate-300"
                  : "bg-slate-100 text-slate-600"
                  }`}
              >
                {isListLoading ? "…" : `${deals.length} total`}
              </span>
            </div>
          </header>

          {listError && (
            <p className="border-b px-5 py-3 text-sm text-destructive">
              {listError}
            </p>
          )}

          <div className="scrollbar-thin max-h-[min(640px,70vh)] space-y-2.5 overflow-y-auto p-4">
            {isListLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading applications…
              </p>
            ) : deals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {dealSearch.trim()
                  ? "No deals match your search."
                  : "No applications found."}
              </p>
            ) : (
              deals.map((deal) => {
                const isActive = selectedId === deal.id;
                const letter = deal.merchant.trim().charAt(0).toUpperCase();
                return (
                  <button
                    key={deal.id}
                    type="button"
                    onClick={() => setSelectedId(deal.id)}
                    className={`group relative w-full overflow-hidden rounded-2xl border text-left transition-all duration-200 ${isActive
                      ? "border-[var(--brand)]/55 bg-gradient-to-br from-[var(--brand)]/14 to-transparent shadow-[0_20px_50px_-28px_rgba(169,98,205,0.85)] ring-1 ring-[var(--brand)]/25"
                      : isDark
                        ? "border-[#2A3546] bg-[#131923]/90 hover:border-[#3D4F66] hover:bg-[#151d2a]"
                        : "border-[#E5EDF5] bg-white/90 hover:border-[#C5D9ED] hover:shadow-md"
                      }`}
                  >
                    <span
                      className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl transition-colors ${isActive
                        ? "bg-[image:var(--brand-gradient)]"
                        : "bg-transparent group-hover:bg-slate-400/40"
                        }`}
                    />
                    <div className="flex items-stretch gap-3 pl-3.5 pr-4 py-3.5">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${isActive
                          ? "bg-[image:var(--brand-gradient)] text-white shadow-md shadow-[var(--brand)]/30"
                          : isDark
                            ? "bg-slate-800 text-slate-200"
                            : "bg-slate-100 text-slate-700"
                          }`}
                      >
                        {letter}
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <h3
                            className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                            title={deal.merchant}
                          >
                            {deal.merchant}
                          </h3>
                          <p className="shrink-0 pl-2 text-right text-xs whitespace-nowrap text-slate-700 dark:text-slate-200">
                            Deal ID: {getDealIdDisplay(deal)} | Queue:{" "}
                            {deal.statusLabel}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center  text-[11px]">
                          {/* <span className="font-medium text-[var(--brand)]">Offer: {formatCurrency(deal.offerAmount)}</span> */}
                          <span className="text-muted-foreground">·</span>
                          <span className="text-muted-foreground">
                            Created:{" "}
                            {deal.date
                              ? new Date(deal.date).toLocaleDateString("en-US")
                              : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="lg:sticky lg:top-6 shadow-lg">
          <div className="space-y-6 rounded-2xl border border-border bg-background p-6 shadow-sm">
            {isListLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Loading deal details…
              </div>
            ) : !selectedDeal ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Pick a deal from the pipeline to see payout details.
              </div>
            ) : (
              <>
                <div className="space-y-5 pb-6">
                  <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[image:var(--brand-gradient)] text-base font-semibold text-white">
                      {initial}
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <h2 className="text-lg font-semibold leading-tight tracking-tight text-foreground">
                            {selectedDeal.merchant}
                          </h2>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Funded{" "} at {" "}
                            {selectedDeal.date}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Status: {selectedDeal.statusLabel}
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {selectedDeal.tier && (
                          <div className="flex flex-wrap gap-2">
                            <span
                              className="rounded-full border border-border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                            >
                              {selectedDeal.tier}
                            </span>
                          </div>
                        )}
                        <div className="w-full min-w-0 max-w-md space-y-3">
                          <div className="flex flex-col gap-2">
                            <span className="text-[11px] font-medium text-muted-foreground">
                              Commission for this deal
                            </span>
                            <CommissionRecipientToggle
                              value={selectedDealRecipient}
                              onChange={(next) => {
                                setDealRecipientById((prev) => ({
                                  ...prev,
                                  [selectedId]: next,
                                }));
                              }}
                            />
                          </div>
                          <label
                            htmlFor={`commission-rate-${selectedDeal.id}`}
                            className="mb-1.5 block text-[11px] font-medium text-muted-foreground"
                          >
                            Commission rate ({selectedDealRecipient === "underwriter" ? "underwriter" : "ISO"})
                          </label>
                          <div
                            className="flex h-11 w-full items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:ring-1 focus-within:ring-[var(--brand)]/40"
                          >
                            <span
                              className="flex shrink-0 items-center justify-center border-r border-border px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                              aria-hidden
                            >
                              Rate
                            </span>
                            <input
                              id={`commission-rate-${selectedDeal.id}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              max={100}
                              step={0.01}
                              placeholder="0"
                              value={commissionDraft}
                              onChange={(e) => setCommissionDraft(e.target.value)}
                              onBlur={() => {
                                const d = displayedDealForCommission ?? selectedDealCommissionView;
                                if (d?.baseRatePct != null)
                                  setCommissionDraft(String(d.baseRatePct));
                              }}
                              className={`min-w-0 flex-1 border-0 bg-transparent px-3 text-sm font-semibold tabular-nums text-foreground placeholder:text-muted-foreground/50 outline-none ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${isDark ? "[color-scheme:dark]" : ""
                                }`}
                            />
                            <span
                              className="flex shrink-0 select-none items-center pr-3 pl-1 text-sm font-medium tabular-nums text-muted-foreground"
                            >
                              %
                            </span>
                          </div>
                          <div className="mt-3 flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                            {/* <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground sm:py-0.5">
                              Applied to{" "}
                              {formatCurrency(selectedDeal.fundedAmount)} funded
                              · updates base and net below
                            </p> */}
                            <Button
                              type="button"
                              size="sm"
                              disabled={
                                savingCommission || !canSaveCommissionDraft
                              }
                              onClick={() => void handleSaveCommission()}
                              className="h-9 w-full shrink-0 rounded-md bg-[image:var(--brand-gradient)] px-4 text-xs font-semibold text-white transition-colors hover:opacity-90 sm:h-9 sm:w-auto disabled:opacity-60 disabled:pointer-events-none"
                            >
                              {savingCommission ? "Saving…" : "Update Commission"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pb-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Net commission
                    </p>
                    <p
                      className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${netPositive ? "text-[#009432]" : "text-[#009432]"
                        }`}
                    >
                      {formatSignedNet(breakdown.net)}
                    </p>
                    {/* <p className="mt-1 text-xs text-muted-foreground">
                      After upsell and fees on{" "}
                      {formatCurrency(selectedDeal.fundedAmount)} funded.
                    </p> */}
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">
                          Application
                        </p>
                        {/* <span className="text-xs text-muted-foreground">
                          {selectedDeal.applicationNumber}
                        </span> */}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <DetailTile
                          label="Deal ID"
                          value={applicationCardData.subtitle}
                          isDark={isDark}
                        />
                        {applicationCardData.rows.map(([label, value, emphasis]) => (
                          <DetailTile
                            key={label}
                            label={label}
                            value={value}
                            isDark={isDark}
                            emphasis={emphasis}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-foreground">
                          Funding
                        </p>
                        {/* <span className="text-xs text-[var(--brand)]">Terms</span> */}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {fundingCardData.map(([label, value, emphasis]) => (
                          <DetailTile
                            key={label}
                            label={label}
                            value={value}
                            isDark={isDark}
                            emphasis={emphasis}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* <div className="pt-2">
                    <div className="space-y-0">
                      <BreakdownRow
                        title="Base commission"
                        subtitle={breakdown.baseLabel}
                        value={formatCurrency(breakdown.baseAmount)}
                        valueClass="text-foreground"
                      />
                      <BreakdownRow
                        title="Upsell / points"
                        subtitle={
                          breakdown.upsell !== 0
                            ? "Performance add-ons"
                            : "None applied"
                        }
                        value={
                          breakdown.upsell !== 0
                            ? `+${formatCurrency(breakdown.upsell)}`
                            : "—"
                        }
                        valueClass={
                          breakdown.upsell !== 0
                            ? "text-emerald-500"
                            : "text-muted-foreground"
                        }
                      />
                      <BreakdownRow
                        title="Fees"
                        subtitle="Wire & admin"
                        value={formatCurrency(breakdown.fees)}
                        valueClass="text-rose-500"
                        icon={
                          <ArrowDownRight className="h-3.5 w-3.5 opacity-70" />
                        }
                      />
                    </div>
                  </div> */}
                </div>
              </>
            )}
          </div>
        </aside>



      </div>
    </div>
  );
}

function DetailTile({
  label,
  value,
  emphasis,
  isDark,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  isDark: boolean;
}) {
  return (
    <div className="space-y-1 border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-sm ${emphasis ? "font-semibold text-[var(--brand)]" : "font-medium text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

// function BreakdownRow({
//   title,
//   subtitle,
//   value,
//   valueClass,
//   icon,
// }: {
//   title: string;
//   subtitle: string;
//   value: string;
//   valueClass: string;
//   icon?: ReactNode;
// }) {
//   return (
//     <div className="flex items-start justify-between gap-3 border-b border-border/40 py-3.5 last:border-0">
//       <div className="min-w-0">
//         <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
//           {icon}
//           {title}
//         </p>
//         <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
//       </div>
//       <p className={`shrink-0 text-sm font-bold tabular-nums ${valueClass}`}>
//         {value}
//       </p>
//     </div>
//   );
// }

function formatSignedNet(net: number) {
  return formatCurrency(net);
}
