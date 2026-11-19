"use client";

import type React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
} from "react";
import { useDispatch, useSelector } from "react-redux";
import { toast } from "react-toastify";
import {
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Pencil,
  Save,
  Wallet,
  X,
} from "lucide-react";
import DealReviewPaymentSchedule from "./DealReviewPaymentSchedule";
import { DisbursementCommissionSection } from "./DisbursementCommissionSection";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { AppDispatch, RootState } from "@/redux/store";
import {
  cn,
  formatCurrency,
  formatNumberUS,
  formatNumberUSForInput,
  parseNumberUS,
} from "@/lib/utils";
import {
  computeMonthlyPayment,
  recalculateOfferFields,
  resolveOfferFactorRate,
  resolveOfferPayback,
  type OfferCalcDriverField,
} from "@/lib/offerRepaymentCalculations";
import {
  buildPaymentSchedule,
  getDefaultPaymentStartDate,
  getScheduleEndDate,
  getScheduleFrequencyLabel,
  isWeekend,
  toNextBusinessDay,
  type PaymentScheduleEntry,
} from "@/lib/paymentScheduleDates";
import { axiosGet, axiosPost } from "@/redux/axios";
import {
  getCollectionPayments,
  updateDealEconomics,
} from "@/redux/actions/collectionPaymentActions";
import {
  getTermsOffers,
  updateTermsOffer,
} from "@/redux/actions/termsOfferActions";
import { getApplicationByApplicationId } from "@/redux/actions/applicationActions";
import type { DealCollectionsView } from "@/types/collectionPaymentTypes";
import type { TermsOffer } from "@/types/termsOfferTypes";

export type DealReviewConfirmContext = {
  paymentStartDate: string;
  effectiveStartDate: string;
  paymentSchedule: PaymentScheduleEntry[];
};

type DealReviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applicationId?: string | null;
  applicationRecordId?: string | null;
  onConfirm: (context: DealReviewConfirmContext) => Promise<void> | void;
  confirming?: boolean;
  /**
   * When true, the dialog fetches offer/terms/collection data even while it
   * is closed, so the form is already populated by the time the user opens it.
   * Also preserves cached state across close/open cycles.
   */
  preload?: boolean;
};

type OfferDecisionRecord = {
  _id?: string;
  offer?: number | null;
  rate?: number | null;
  factorRate?: number | null;
  term?: number | string | null;
  frequency?: string | null;
  repayPerPeriod?: number | null;
  fees?: number | null;
  totalRemit?: number | null;
  paybackAmount?: number | null;
  monthlyPayment?: number | null;
  decision?: string | null;
};

const toValidNumber = (value: unknown): number | null => {
  if (value == null || String(value).trim() === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const parseNumberInput = (raw: string): number => {
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
};

const formatNumber = (value: number | null | undefined, fractionDigits = 2) => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

type EditableState = {
  advance: number;
  factorRate: number;
  payback: number;
  daily: number;
  feesAmount: number;
  commissionAmount: number;
  monthlyPayment: number;
  term: string;
  frequency: string;
};

const DEFAULT_FORM: EditableState = {
  advance: 0,
  factorRate: 1.5,
  payback: 0,
  daily: 0,
  feesAmount: 0,
  commissionAmount: 0,
  monthlyPayment: 0,
  term: "",
  frequency: "Daily",
};

const OFFER_CALC_FIELDS: OfferCalcDriverField[] = [
  "advance",
  "factorRate",
  "term",
  "frequency",
  "payback",
  "daily",
];

function pickLatestTermsOffer(rows: TermsOffer[]): TermsOffer | null {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const ta = Date.parse(String(a.createdAt ?? ""));
    const tb = Date.parse(String(b.createdAt ?? ""));
    if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
    return Number(b.termsOfferId ?? 0) - Number(a.termsOfferId ?? 0);
  })[0];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uniqueApplicationKeys(...candidates: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    const key = raw != null ? String(raw).trim() : "";
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** API may return flat fields or nested `offer` JSON — normalize for the form. */
function normalizeOfferDecision(raw: unknown): OfferDecisionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const inner =
    row.offer && typeof row.offer === "object" && !Array.isArray(row.offer)
      ? (row.offer as Record<string, unknown>)
      : null;

  const offer =
    toValidNumber(row.offer) ??
    toValidNumber(inner?.offer) ??
    toValidNumber(inner?.approvedAmount);

  if (
    offer == null &&
    row.rate == null &&
    row.fees == null &&
    row.totalRemit == null &&
    row.repayPerPeriod == null
  ) {
    return null;
  }

  return {
    _id: row._id != null ? String(row._id) : undefined,
    offer,
    rate:
      toValidNumber(row.rate) ??
      toValidNumber(row.factorRate) ??
      toValidNumber(inner?.rate),
    factorRate: toValidNumber(row.factorRate),
    term: (row.term ?? inner?.term) as number | string | null | undefined,
    frequency: String(row.frequency ?? inner?.frequency ?? "").trim() || null,
    repayPerPeriod:
      toValidNumber(row.repayPerPeriod) ??
      toValidNumber(inner?.repayPerPeriod) ??
      toValidNumber(inner?.daysWeeks),
    fees: toValidNumber(row.fees) ?? toValidNumber(inner?.fees),
    totalRemit:
      toValidNumber(row.totalRemit) ??
      toValidNumber(inner?.totalRemit) ??
      toValidNumber(inner?.paybackAmount),
    paybackAmount: toValidNumber(row.paybackAmount),
    monthlyPayment:
      toValidNumber(row.monthlyPayment) ?? toValidNumber(inner?.monthlyPayment),
    decision: row.decision != null ? String(row.decision) : null,
  };
}

/** `Application.commissionAmount` (DB) — prefer over collections/terms when set. */
function resolveApplicationCommissionAmount(
  applicationData: Record<string, unknown> | null | undefined,
  advance: number
): number | null {
  if (!applicationData) return null;

  const direct =
    toValidNumber(applicationData.commissionAmount) ??
    toValidNumber(applicationData.CommissionAmount);

  if (direct != null) return direct;

  const pct =
    toValidNumber(applicationData.commissionPercentage) ??
    toValidNumber(applicationData.CommissionPercentage);
  if (pct != null && advance > 0) {
    return +(advance * (pct / 100)).toFixed(2);
  }

  return null;
}

function buildFormFromSources(
  dealView: DealCollectionsView | null,
  offerDecision: OfferDecisionRecord | null,
  latestTerms: TermsOffer | null,
  applicationData: Record<string, unknown> | null
): EditableState {
  const summary = dealView?.offerSummary;
  const schedule = dealView?.schedule;

  const advance =
    toValidNumber(summary?.advanceNum) ??
    toValidNumber(offerDecision?.offer) ??
    toValidNumber(latestTerms?.approvedAmount) ??
    toValidNumber(applicationData?.loanAmount) ??
    0;

  const factorRate = resolveOfferFactorRate({
    summaryFactor: toValidNumber(summary?.factorRate),
    offerDecisionRate: toValidNumber(offerDecision?.rate),
    offerDecisionFactorRate: toValidNumber(offerDecision?.factorRate),
    termsFactorRate: toValidNumber(latestTerms?.factorRate),
    fallback: 1.5,
  });

  const payback = resolveOfferPayback(advance, factorRate, {
    paybackNum: toValidNumber(summary?.paybackNum),
    termsPaybackAmount: toValidNumber(latestTerms?.paybackAmount),
    offerPaybackAmount: toValidNumber(offerDecision?.paybackAmount),
    totalRemit: toValidNumber(offerDecision?.totalRemit),
  });

  const daily =
    toValidNumber(summary?.paymentAmount) ??
    toValidNumber(schedule?.dailyPayment) ??
    toValidNumber(offerDecision?.repayPerPeriod) ??
    toValidNumber(latestTerms?.paymentAmount) ??
    0;

  const feesAmount =
    toValidNumber(summary?.feesAmount) ?? toValidNumber(offerDecision?.fees) ?? 0;

  const offerDecisionCommission =
    toValidNumber(
      (offerDecision as { commissionAmount?: number | null } | null)?.commissionAmount
    ) ?? null;

  const applicationCommission = resolveApplicationCommissionAmount(
    applicationData,
    advance
  );

  const commissionAmount =
    applicationCommission ??
    offerDecisionCommission ??
    toValidNumber(summary?.commissionOnDeal) ??
    toValidNumber(latestTerms?.commissionAmount) ??
    0;

  const term =
    offerDecision?.term != null && String(offerDecision.term).trim() !== ""
      ? String(offerDecision.term)
      : latestTerms?.termLength != null
        ? String(latestTerms.termLength)
        : "";

  const frequency =
    summary?.frequencyLabel ||
    offerDecision?.frequency ||
    latestTerms?.frequency ||
    "Daily";

  const monthlyPayment =
    payback > 0 && term.trim() !== ""
      ? computeMonthlyPayment({ payback, term, frequency })
      : toValidNumber(offerDecision?.monthlyPayment) ?? 0;

  return {
    advance,
    factorRate,
    payback,
    daily,
    feesAmount,
    commissionAmount,
    monthlyPayment,
    term,
    frequency,
  };
}

export default function DealReviewDialog({
  open,
  onOpenChange,
  applicationId,
  applicationRecordId,
  onConfirm,
  confirming = false,
  preload = false,
}: DealReviewDialogProps) {
  const dispatch = useDispatch<AppDispatch>();

  const { data: applicationData } = useSelector(
    (state: RootState) => state.applicationDetail
  );

  const [editMode, setEditMode] = useState(false);
  const editModeRef = useRef(false);
  /** False while user is editing; re-enabled after a successful Update. */
  const [canConfirmDisbursement, setCanConfirmDisbursement] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingOffer, setLoadingOffer] = useState(false);
  const [form, setForm] = useState<EditableState>(DEFAULT_FORM);
  const [paymentStartDate, setPaymentStartDate] = useState("");
  const [paymentStartTouched, setPaymentStartTouched] = useState(false);
  const [editableSchedule, setEditableSchedule] = useState<
    PaymentScheduleEntry[]
  >([]);

  useEffect(() => {
    editModeRef.current = editMode;
  }, [editMode]);

  useEffect(() => {
    if (open) {
      setCanConfirmDisbursement(true);
    } else {
      setPaymentStartTouched(false);
      setPaymentStartDate("");
      setEditableSchedule([]);
    }
  }, [open]);
  const [offerDecision, setOfferDecision] = useState<OfferDecisionRecord | null>(
    null
  );
  const [termsOffer, setTermsOffer] = useState<TermsOffer | null>(null);
  const [localDealView, setLocalDealView] = useState<DealCollectionsView | null>(
    null
  );

  const appRecord = applicationData as Record<string, unknown> | null;

  const primaryApplicationId = useMemo(() => {
    const raw =
      applicationRecordId ??
      (appRecord?._id as string | undefined) ??
      (appRecord?.id as string | undefined);
    return raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  }, [applicationRecordId, appRecord]);

  const applicationDealId = useMemo(() => {
    const raw =
      (appRecord?.dealId as string | undefined) ??
      (appRecord?.dealID as string | undefined) ??
      (appRecord?.deal_id as string | undefined);
    return raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
  }, [appRecord]);

  const numericApplicationId = useMemo(() => {
    const raw = appRecord?.applicationId;
    return raw != null && String(raw).trim() !== ""
      ? String(raw).trim()
      : "";
  }, [appRecord]);

  const apiApplicationKey =
    primaryApplicationId ||
    numericApplicationId ||
    applicationDealId ||
    (applicationId != null ? String(applicationId).trim() : "");

  const dealViewLookupKey = applicationDealId || primaryApplicationId;
  const dealViewFromStore = useSelector((state: RootState) =>
    dealViewLookupKey
      ? state.collectionPayments.dealViewByKey[dealViewLookupKey] ?? null
      : null
  );
  const dealView = localDealView ?? dealViewFromStore;

  const loadOfferData = useCallback(async () => {
    const lookupKeys = uniqueApplicationKeys(
      primaryApplicationId,
      numericApplicationId,
      applicationDealId,
      applicationId
    );
    if (!lookupKeys.length) return;

    setLoadingOffer(true);
    let fetchedDealView: DealCollectionsView | null = null;
    let od: OfferDecisionRecord | null = null;
    let latest: TermsOffer | null = null;

    try {
      // Collection payments require a resolvable deal id — try each key; ignore 404s.
      const collectionAttempts: Array<{ applicationId: string; dealId?: string }> =
        [];
      if (applicationDealId) {
        if (primaryApplicationId) {
          collectionAttempts.push({
            applicationId: primaryApplicationId,
            dealId: applicationDealId,
          });
        }
        collectionAttempts.push({ applicationId: "", dealId: applicationDealId });
      }
      for (const key of lookupKeys) {
        if (UUID_RE.test(key)) {
          collectionAttempts.push({ applicationId: key, dealId: applicationDealId || undefined });
        } else if (/^\d+$/.test(key)) {
          collectionAttempts.push({ applicationId: key, dealId: applicationDealId || undefined });
        }
      }

      for (const attempt of collectionAttempts) {
        if (fetchedDealView) break;
        try {
          const collectionResult = await dispatch(
            getCollectionPayments({
              applicationId: attempt.applicationId,
              dealId: attempt.dealId,
              includeDealView: true,
              force: true,
            })
          ).unwrap();
          fetchedDealView =
            (collectionResult as { dealView?: DealCollectionsView | null })
              ?.dealView ?? null;
        } catch {
          // App may not have dealId yet — offer-decision / terms-offers still load below.
        }
      }

      const offerResults = await Promise.allSettled(
        lookupKeys.map((key) =>
          axiosGet("/offer-decisions", { params: { application: key } })
        )
      );
      for (const result of offerResults) {
        if (result.status !== "fulfilled") continue;
        const parsed = normalizeOfferDecision(result.value?.data?.data);
        if (parsed) {
          od = parsed;
          break;
        }
      }

      const termsResults = await Promise.allSettled(
        lookupKeys.map((key) =>
          axiosGet(`/terms-offers?application=${encodeURIComponent(key)}`)
        )
      );
      for (const result of termsResults) {
        if (result.status !== "fulfilled") continue;
        const termsList = Array.isArray(result.value?.data?.data)
          ? (result.value.data.data as TermsOffer[])
          : Array.isArray(result.value?.data)
            ? (result.value.data as TermsOffer[])
            : [];
        const picked = pickLatestTermsOffer(termsList);
        if (picked) {
          latest = picked;
          break;
        }
      }

      let resolvedAppRecord: Record<string, unknown> | null =
        applicationData as Record<string, unknown> | null;
      try {
        if (numericApplicationId) {
          const appRes = await axiosGet(
            `/applications/applicationId/${encodeURIComponent(numericApplicationId)}`
          );
          const body = appRes?.data?.data ?? appRes?.data;
          if (body && typeof body === "object") {
            resolvedAppRecord = body as Record<string, unknown>;
          }
        } else if (primaryApplicationId && UUID_RE.test(primaryApplicationId)) {
          const appRes = await axiosGet(
            `/applications/${encodeURIComponent(primaryApplicationId)}`
          );
          const body = appRes?.data?.data ?? appRes?.data;
          if (body && typeof body === "object") {
            resolvedAppRecord = body as Record<string, unknown>;
          }
        }
      } catch {
        // Keep Redux application detail if direct fetch fails.
      }

      setLocalDealView(fetchedDealView);
      setOfferDecision(od);
      setTermsOffer(latest);
      // Do not clobber in-progress edits when Redux/application refetch completes.
      if (!editModeRef.current) {
        setForm(
          buildFormFromSources(fetchedDealView, od, latest, resolvedAppRecord)
        );
      }
    } catch {
      toast.error("Could not load offer details. Please try again.");
    } finally {
      setLoadingOffer(false);
    }
  }, [
    applicationDealId,
    applicationId,
    dispatch,
    numericApplicationId,
    primaryApplicationId,
  ]);

  useEffect(() => {
    if (!open && !preload) return;

    const refetchId = numericApplicationId || applicationId;
    if (refetchId) {
      void dispatch(getApplicationByApplicationId(String(refetchId)));
    }

    void loadOfferData();
  }, [
    open,
    preload,
    loadOfferData,
    applicationId,
    dispatch,
    numericApplicationId,
  ]);

  // When application detail lands in Redux after load, apply DB commissionAmount.
  useEffect(() => {
    if (!open || loadingOffer || !appRecord || editMode) return;
    const advance =
      form.advance > 0
        ? form.advance
        : toValidNumber(appRecord.loanAmount) ?? 0;
    const appCommission = resolveApplicationCommissionAmount(appRecord, advance);
    if (appCommission == null) return;
    setForm((prev) =>
      prev.commissionAmount === appCommission
        ? prev
        : { ...prev, commissionAmount: appCommission }
    );
  }, [open, loadingOffer, appRecord, form.advance, editMode]);

  const appNumericId = (applicationData as { applicationId?: number } | null)
    ?.applicationId;

  const advanceForCommission = form.advance > 0
    ? form.advance
    : toValidNumber(appRecord?.loanAmount) ?? 0;

  const loanAmountFallback = toValidNumber(appRecord?.loanAmount) ?? 0;
  const hasOfferData =
    dealView != null ||
    offerDecision != null ||
    termsOffer != null ||
    loanAmountFallback > 0 ||
    form.advance > 0;

  useEffect(() => {
    if (!open || paymentStartTouched) return;
    const raw = dealView?.schedule?.startDate;
    const fromDeal =
      raw != null && String(raw).trim() !== ""
        ? String(raw).trim().slice(0, 10)
        : "";
    const freq = getScheduleFrequencyLabel(form.frequency);
    const initial =
      fromDeal && /^\d{4}-\d{2}-\d{2}$/.test(fromDeal)
        ? freq === "Daily"
          ? toNextBusinessDay(fromDeal)
          : fromDeal
        : getDefaultPaymentStartDate();
    setPaymentStartDate(initial);
  }, [open, dealView?.schedule?.startDate, form.frequency, paymentStartTouched]);

  const generatedSchedule = useMemo(
    () =>
      buildPaymentSchedule({
        startDate: paymentStartDate,
        term: form.term,
        frequency: form.frequency,
        paymentAmount: form.daily,
      }),
    [paymentStartDate, form.term, form.frequency, form.daily],
  );

  useEffect(() => {
    setEditableSchedule(generatedSchedule);
  }, [generatedSchedule]);

  const paymentSchedule = editableSchedule;

  const scheduleEndDate = getScheduleEndDate(paymentSchedule);
  const effectiveFirstPaymentDate = paymentSchedule[0]?.date ?? "";
  const frequencyLabel = getScheduleFrequencyLabel(form.frequency);
  const skipsWeekendsForDaily =
    frequencyLabel === "Daily" &&
    Boolean(paymentStartDate) &&
    isWeekend(paymentStartDate) &&
    Boolean(effectiveFirstPaymentDate) &&
    effectiveFirstPaymentDate !== paymentStartDate;

  const canScheduleDisbursement =
    canConfirmDisbursement &&
    !editMode &&
    Boolean(paymentStartDate) &&
    paymentSchedule.length > 0;

  const handleConfirmDisbursement = useCallback(() => {
    if (!paymentStartDate || !paymentSchedule.length) {
      toast.error(
        "Choose a payment start date and make sure term is set in the offer.",
      );
      return;
    }
    void onConfirm({
      paymentStartDate,
      effectiveStartDate: effectiveFirstPaymentDate || paymentStartDate,
      paymentSchedule,
    });
  }, [
    onConfirm,
    paymentStartDate,
    paymentSchedule,
    effectiveFirstPaymentDate,
  ]);

  const applyOfferRecalc = (
    state: EditableState,
    driver: OfferCalcDriverField
  ): EditableState => {
    const recalculated = recalculateOfferFields(state, driver);
    if (!recalculated) return state;
    return {
      ...state,
      advance: recalculated.advance,
      factorRate: recalculated.factorRate,
      payback: recalculated.payback,
      daily: recalculated.daily,
      monthlyPayment: recalculated.monthlyPayment,
    };
  };

  const handleFieldChange = (field: keyof EditableState, raw: string) => {
    setForm((prev) => {
      const next: EditableState = { ...prev };

      if (field === "term" || field === "frequency") {
        next[field] = raw;
        if (field === "frequency") {
          return applyOfferRecalc(next, "frequency");
        }
        // Live recalc for term when value is a valid positive number.
        const recalculated = recalculateOfferFields(next, "term");
        if (recalculated) {
          return { ...next, ...recalculated };
        }
        return next;
      }

      next[field] = parseNumberInput(raw);

      if (!OFFER_CALC_FIELDS.includes(field as OfferCalcDriverField)) {
        return next;
      }

      return applyOfferRecalc(next, field as OfferCalcDriverField);
    });
  };

  const handleTermCommit = useCallback((committedTerm: string) => {
    setForm((prev) => {
      const next = { ...prev, term: committedTerm };
      const recalculated = recalculateOfferFields(next, "term");
      return recalculated ? { ...next, ...recalculated } : next;
    });
  }, []);

  const handleStartEdit = useCallback(() => {
    editModeRef.current = true;
    setCanConfirmDisbursement(false);
    setEditMode(true);
  }, []);

  const handleCancelEdit = () => {
    setForm(
      buildFormFromSources(dealView, offerDecision, termsOffer, appRecord)
    );
    editModeRef.current = false;
    setEditMode(false);
    setCanConfirmDisbursement(true);
  };

  const handleSave = async () => {
    if (!apiApplicationKey) {
      toast.error("Application context is missing.");
      return;
    }

    setSaving(true);
    try {
      const formToSave = applyOfferRecalc(form, "term");

      // Offer upsert recalculates Application.commissionAmount from ISO % — run first.
      await axiosPost("/offer-decisions", {
        applicationId: apiApplicationKey,
        decision:
          offerDecision?.decision === "declined" ? "declined" : "approved",
        offer: formToSave.advance,
        rate: formToSave.factorRate,
        term: formToSave.term || null,
        frequency: formToSave.frequency || null,
        repayPerPeriod: formToSave.daily,
        fees: formToSave.feesAmount,
        totalRemit: formToSave.payback,
        monthlyPayment: formToSave.monthlyPayment || null,
      });

      if (termsOffer?._id) {
        await dispatch(
          updateTermsOffer({
            id: termsOffer._id,
            data: {
              approvedAmount: formToSave.advance,
              factorRate: formToSave.factorRate,
              paybackAmount: formToSave.payback,
              paymentAmount: formToSave.daily,
              termLength: formToSave.term
                ? Number(formToSave.term) || formToSave.term
                : undefined,
              frequency: formToSave.frequency,
              commissionAmount: formToSave.commissionAmount,
            },
          })
        ).unwrap();
      }

      // Persist fees + commission last so user-edited commission is not overwritten.
      const economics = await dispatch(
        updateDealEconomics({
          applicationId:
            primaryApplicationId || numericApplicationId || undefined,
          dealId: applicationDealId || undefined,
          feesAmount: formToSave.feesAmount,
          commissionOnDeal: formToSave.commissionAmount,
        })
      ).unwrap();

      const savedCommission = Number(
        economics?.data?.commissionOnDeal ?? formToSave.commissionAmount
      );
      const savedFees = Number(
        economics?.data?.feesAmount ?? formToSave.feesAmount
      );

      setEditMode(false);
      editModeRef.current = false;
      setCanConfirmDisbursement(true);

      setForm({
        ...formToSave,
        commissionAmount: savedCommission,
        feesAmount: savedFees,
      });

      const refetchId = numericApplicationId || applicationId;
      if (refetchId) {
        await dispatch(getApplicationByApplicationId(String(refetchId))).unwrap();
      }
      void dispatch(getTermsOffers({ application: apiApplicationKey }));

      if (dealViewLookupKey) {
        void dispatch(
          getCollectionPayments({
            applicationId: primaryApplicationId || numericApplicationId || "",
            dealId: applicationDealId || undefined,
            includeDealView: true,
            force: true,
          })
        );
      }

      await loadOfferData();

      toast.success("Deal details updated.");
    } catch (err) {
      const message =
        typeof err === "string"
          ? err
          : (err as { message?: string })?.message ||
            "Could not save deal details. Please try again.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (saving || confirming) return;
    if (!next) {
      editModeRef.current = false;
      setEditMode(false);
      // When preload is enabled, keep the cached offer data so the next open
      // shows filled values immediately instead of a loading state.
      if (!preload) {
        setLocalDealView(null);
        setOfferDecision(null);
        setTermsOffer(null);
      }
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[920px] p-0 overflow-hidden border border-slate-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#141517] max-h-[90vh] flex flex-col gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-slate-100/80 bg-gradient-to-b from-slate-50/80 to-white dark:from-slate-900/50 dark:to-[#141517] dark:border-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-blue-600/25">
                <BadgeCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  Review deal details
                </DialogTitle>
                <p className="text-sm text-slate-500 mt-1 dark:text-slate-400">
                  Verify the offer and fees before disbursing funds.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/80 dark:text-blue-200">
              {appNumericId ? `BA${appNumericId}` : "Application"}
            </span>
          </div>
          {editMode ? (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/60">
              <Pencil className="h-3 w-3" />
              Editing — click Update when finished
            </p>
          ) : null}
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:bg-[#1A1B1F]/60 dark:ring-white/[0.04]">
            <FundingOfferSection
              loadingOffer={loadingOffer}
              hasOfferData={hasOfferData}
              editMode={editMode}
              onStartEdit={handleStartEdit}
              form={form}
              onFieldChange={handleFieldChange}
              onTermCommit={handleTermCommit}
            />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:bg-[#1A1B1F]/60 dark:ring-white/[0.04]">
            <DisbursementCommissionSection
              variant="embedded"
              applicationRecordId={applicationRecordId ?? null}
              refetchApplicationId={applicationId ?? null}
              offerAmountOverride={advanceForCommission}
            />
          </section>

          {!editMode ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03] dark:border-slate-800 dark:bg-[#1A1B1F]/60 dark:ring-white/[0.04]">
              <DealReviewPaymentSchedule
                paymentStartDate={paymentStartDate}
                onPaymentStartDateChange={(value) => {
                  setPaymentStartTouched(true);
                  setPaymentStartDate(value);
                }}
                frequency={form.frequency}
                term={form.term}
                paymentAmount={form.daily}
                schedule={paymentSchedule}
                onScheduleChange={setEditableSchedule}
                scheduleEndDate={scheduleEndDate}
                effectiveFirstPaymentDate={effectiveFirstPaymentDate}
                skipsWeekendsForDaily={skipsWeekendsForDaily}
                loadingOffer={loadingOffer}
              />
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 bg-gradient-to-t from-slate-50 to-slate-50/80 px-6 py-4 dark:border-slate-800 dark:from-slate-900/80 dark:to-slate-900/50">
          <p className="hidden max-w-md text-xs text-slate-500 dark:text-slate-400 sm:flex sm:items-center sm:gap-1.5">
            {canScheduleDisbursement && !editMode ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : null}
            {editMode
              ? "Click Update to save your changes."
              : canScheduleDisbursement
                ? "Review offer values and payment dates, then confirm disbursement."
                : canConfirmDisbursement
                  ? "Set a valid term and first payment date to continue."
                  : "Click Update after editing to enable disbursement."}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2.5 ml-auto w-full sm:w-auto">
          {editMode ? (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                disabled={saving}
                className="cursor-pointer rounded-lg h-10 px-4"
              >
                <X className="w-4 h-4 mr-1.5" />
                Cancel edit
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                variant="default"
                className="cursor-pointer rounded-lg h-10 px-4 font-semibold shadow-sm"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating…
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Save className="w-4 h-4" />
                    Update
                  </span>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={confirming}
                className="cursor-pointer rounded-lg h-10 px-4"
              >
                Cancel
              </Button>
              {canScheduleDisbursement ? (
                <Button
                  type="button"
                  variant="default"
                  onClick={() => void handleConfirmDisbursement()}
                  disabled={confirming || saving}
                  className="cursor-pointer rounded-lg h-10 px-5 font-semibold shadow-sm"
                >
                  {confirming ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing…
                    </span>
                  ) : (
                    "Confirm disbursement"
                  )}
                </Button>
              ) : null}
            </>
          )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100/90 px-5 py-3.5 dark:border-slate-800">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Icon className="h-4 w-4" />
        </div>
        <h4 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
          {title}
        </h4>
      </div>
      {action}
    </div>
  );
}

type FundingOfferSectionProps = {
  loadingOffer: boolean;
  hasOfferData: boolean;
  editMode: boolean;
  onStartEdit: () => void;
  form: EditableState;
  onFieldChange: (field: keyof EditableState, raw: string) => void;
  onTermCommit: (committedTerm: string) => void;
};

function FundingOfferSection({
  loadingOffer,
  hasOfferData,
  editMode,
  onStartEdit,
  form,
  onFieldChange,
  onTermCommit,
}: FundingOfferSectionProps) {
  return (
    <>
      <SectionHeading
        icon={Wallet}
        title="Funding — Offer Details"
        action={
          !editMode ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              disabled={loadingOffer && !hasOfferData}
              className="cursor-pointer h-8 gap-1.5 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800 dark:border-blue-900 dark:text-blue-300 dark:hover:bg-blue-950/60"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          ) : (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              Editable
            </span>
          )
        }
      />

      {loadingOffer && !hasOfferData && !editMode ? (
        <OfferLoadingState />
      ) : !hasOfferData && !editMode ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No offer data found. Click Edit to enter offer details.
          </p>
        </div>
      ) : (
        <OfferFieldsGrid
          form={form}
          editMode={editMode}
          onFieldChange={onFieldChange}
          onTermCommit={onTermCommit}
        />
      )}
    </>
  );
}

function OfferLoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
      Loading offer details…
    </div>
  );
}

const INPUT_CLASS =
  "mt-1.5 h-10 rounded-lg border-slate-200 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950";

const READONLY_INPUT_CLASS = cn(
  INPUT_CLASS,
  "cursor-default bg-slate-50 text-slate-900 focus-visible:ring-0 dark:bg-slate-900/60 dark:text-slate-100"
);

const READ_ONLY_VALUE_CLASS =
  "mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100";

function OfferFieldsGrid({
  form,
  editMode,
  onFieldChange,
  onTermCommit,
}: {
  form: EditableState;
  editMode: boolean;
  onFieldChange: (field: keyof EditableState, raw: string) => void;
  onTermCommit: (committedTerm: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-5 px-4 py-5">
      <EditableMoneyField
        label="Advance"
        value={form.advance}
        editable={editMode}
        onChange={(v) => onFieldChange("advance", v)}
        display={formatCurrency(form.advance)}
      />
      <EditableNumberField
        label="Factor"
        value={form.factorRate}
        editable={editMode}
        fractionDigits={3}
        onChange={(v) => onFieldChange("factorRate", v)}
        display={formatNumber(form.factorRate, 3)}
      />
      <EditableMoneyField
        label="Payback"
        value={form.payback}
        editable={editMode}
        onChange={(v) => onFieldChange("payback", v)}
        display={formatCurrency(form.payback)}
      />
      <EditableMoneyField
        label="Daily"
        value={form.daily}
        editable={editMode}
        onChange={(v) => onFieldChange("daily", v)}
        display={formatCurrency(form.daily)}
      />
      <EditableMoneyField
        label="Monthly payment"
        value={form.monthlyPayment}
        editable={editMode}
        readOnly
        onChange={() => undefined}
        display={
          form.monthlyPayment > 0 ? formatCurrency(form.monthlyPayment) : "—"
        }
      />
      <EditableTextField
        label="Term"
        value={form.term}
        editable={editMode}
        numeric
        onChange={(v) => onFieldChange("term", v)}
        onCommit={onTermCommit}
        display={
          form.term
            ? Number(form.term).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })
            : "—"
        }
      />
      <EditableFrequencyField
        value={form.frequency}
        editable={editMode}
        onChange={(v) => onFieldChange("frequency", v)}
        display={form.frequency || "—"}
      />
      <EditableMoneyField
        label="Fees"
        value={form.feesAmount}
        editable={editMode}
        onChange={(v) => onFieldChange("feesAmount", v)}
        display={formatCurrency(form.feesAmount)}
      />
    </div>
  );
}

function formatUsMoneyInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return formatNumberUS(value);
}

function formatUsFactorInputValue(value: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function EditableMoneyField({
  label,
  value,
  editable,
  readOnly = false,
  display,
  onChange,
}: {
  label: string;
  value: number;
  editable: boolean;
  readOnly?: boolean;
  display: string;
  onChange: (raw: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setDraft(formatUsMoneyInputValue(value));
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseNumberUS(draft);
    onChange(Number.isFinite(parsed) ? String(parsed) : "0");
  };

  const boxValue = value > 0 ? formatUsMoneyInputValue(value) : "";

  return (
    <div className="min-w-0">
      <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
        {label}
      </Label>
      {editable ? (
        <div className="relative mt-1.5">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">
            $
          </span>
          <Input
            type="text"
            inputMode="decimal"
            readOnly={readOnly}
            tabIndex={readOnly ? -1 : undefined}
            value={
              readOnly
                ? boxValue
                : focused
                  ? draft
                  : formatUsMoneyInputValue(value)
            }
            onFocus={readOnly ? undefined : handleFocus}
            onBlur={readOnly ? undefined : handleBlur}
            onChange={
              readOnly
                ? undefined
                : (e) => {
                    e.stopPropagation();
                    const formatted = formatNumberUSForInput(e.target.value);
                    setDraft(formatted);
                    const parsed = parseNumberUS(formatted);
                    if (Number.isFinite(parsed)) onChange(String(parsed));
                  }
            }
            onClick={(e) => e.stopPropagation()}
            className={cn(
              readOnly ? READONLY_INPUT_CLASS : INPUT_CLASS,
              "mt-0 pl-7"
            )}
          />
        </div>
      ) : (
        <p className={READ_ONLY_VALUE_CLASS}>{display}</p>
      )}
    </div>
  );
}

function EditableNumberField({
  label,
  value,
  editable,
  display,
  onChange,
  fractionDigits = 3,
}: {
  label: string;
  value: number;
  editable: boolean;
  display: string;
  onChange: (raw: string) => void;
  fractionDigits?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const formatForInput =
    fractionDigits === 3 ? formatUsFactorInputValue : formatUsMoneyInputValue;

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setDraft(formatForInput(value));
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseNumberUS(draft);
    onChange(Number.isFinite(parsed) ? String(parsed) : "0");
  };

  return (
    <div className="min-w-0">
      <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
        {label}
      </Label>
      {editable ? (
        <Input
          type="text"
          inputMode="decimal"
          value={focused ? draft : formatForInput(value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={(e) => {
            e.stopPropagation();
            const formatted = formatNumberUSForInput(e.target.value);
            setDraft(formatted);
            const parsed = parseNumberUS(formatted);
            if (Number.isFinite(parsed)) onChange(String(parsed));
          }}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <p className={READ_ONLY_VALUE_CLASS}>{display}</p>
      )}
    </div>
  );
}

function EditableFrequencyField({
  value,
  editable,
  display,
  onChange,
}: {
  value: string;
  editable: boolean;
  display: string;
  onChange: (raw: string) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
        Frequency
      </Label>
      {editable ? (
        <select
          value={value || "Daily"}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className={cn(INPUT_CLASS, "cursor-pointer w-full")}
        >
          <option value="Daily">Daily</option>
          <option value="Weekly">Weekly</option>
          <option value="Bi-Weekly">Bi-Weekly</option>
          <option value="Monthly">Monthly</option>
        </select>
      ) : (
        <p className={READ_ONLY_VALUE_CLASS}>{display}</p>
      )}
    </div>
  );
}

function EditableTextField({
  label,
  value,
  editable,
  display,
  onChange,
  onCommit,
  numeric = false,
}: {
  label: string;
  value: string;
  editable: boolean;
  display: string;
  onChange: (raw: string) => void;
  onCommit?: (committedValue: string) => void;
  numeric?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const formatTerm = (raw: string) => {
    const n = parseNumberUS(raw);
    if (!Number.isFinite(n) || n <= 0) return raw.replace(/[^0-9]/g, "");
    return Math.round(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  };

  useEffect(() => {
    if (!focused) {
      setDraft(numeric ? formatTerm(value) : value);
    }
  }, [value, focused, numeric]);

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    e.stopPropagation();
    setDraft(numeric ? formatTerm(value) : value);
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    if (numeric) {
      const parsed = parseNumberUS(draft);
      const committed = Number.isFinite(parsed)
        ? String(Math.round(parsed))
        : "";
      if (onCommit) {
        onCommit(committed);
      } else {
        onChange(committed);
      }
    }
  };

  return (
    <div className="min-w-0">
      <Label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider dark:text-slate-400">
        {label}
      </Label>
      {editable ? (
        <Input
          type="text"
          inputMode={numeric ? "numeric" : "text"}
          value={focused ? draft : numeric ? formatTerm(value) : value}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (numeric && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onChange={(e) => {
            e.stopPropagation();
            if (numeric) {
              const cleaned = e.target.value.replace(/[^0-9]/g, "");
              const formatted = cleaned
                ? Number(cleaned).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })
                : "";
              setDraft(formatted);
              onChange(cleaned);
            } else {
              onChange(e.target.value);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={INPUT_CLASS}
        />
      ) : (
        <p className={READ_ONLY_VALUE_CLASS}>{display}</p>
      )}
    </div>
  );
}
