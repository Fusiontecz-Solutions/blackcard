import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import MyNotes from '@/components/application/MyNotes';
import RejectApplicationModal from '@/components/application/RejectApplicationModal';
import RequestMissingDocumentsModal from '@/components/application/RequestMissingDocumentsModal';
import ApproveForDisbursementModal from '@/components/application/ApproveForDisbursementModal';
import ApprovedApplicationModal from '@/components/application/ApprovedApplicationModal';
import ApprovedByUnderwriterBadge from '@/components/application/ApprovedByUnderwriterBadge';
import { Button } from '@/components/ui/button';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/redux/store';
import {
  approveFundingCallForDisbursement,
  createFundingCall,
  getFundingCalls,
} from '@/redux/actions/fundingCallActions';
import {
  getApplicationById,
  sendApplicationForFinalUnderwriterApproval,
  updateApplicationQueue,
} from '@/redux/actions/applicationActions';
import { FINAL_APPROVAL_SOURCE_FUNDING_CALL } from '@/lib/finalApprovalSource';
import { resetCreateFundingCall } from '@/redux/slices/fundingCallSlice';
import { toast } from 'react-toastify';
import { cn } from '@/lib/utils';
import { useTheme } from '@/context/ThemeContext';
import { normalizeRoleKey, resolveEffectiveRole } from '@/lib/sessionRole';
import { normalizeFundingCallStatus } from '@/constants/operationsDashboardApplications';
import { applicationNeedsContractReinitiation } from '@/lib/contractReinitiation';
import { isApplicationInFinalApprovalStage } from '@/lib/applicationWorkflowState';
import {
  formatApprovedByUnderwriterLabel,
  resolveFinalApprovalTargetUnderwriter,
} from '@/lib/underwriterApprovalLabel';
import {
  OFFER_DECISION_UPDATED_EVENT,
  offerDecisionUpdateMatchesApplication,
} from '@/lib/offerDecisionSync';
import {
  APPLICATION_APPROVED_EMAIL_SUBJECT,
  buildApplicationApprovedEmailServerPlaceholderValues,
  renderApplicationApprovedEmailHtml,
} from '@/pages/templates';

const looksLikeEmail = (value: unknown): boolean => {
  const s = String(value ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
};

/** Prefer business owner email over the generic business inbox for client-facing approval mail. */
const resolveLinkedClientEmail = (application: unknown): string => {
  const client = (application as { client?: unknown } | null)?.client;
  if (!client || typeof client !== 'object') return '';

  const nested = client as {
    ownerEmail?: string | null;
    business?: { email?: string | null };
    owner?: { email?: string | null };
    owners?: Array<{ email?: string | null; sortOrder?: number | null }>;
  };

  const primaryOwnerEmail = String(nested.owner?.email ?? '').trim();
  if (looksLikeEmail(primaryOwnerEmail)) return primaryOwnerEmail;

  const ownerRows = Array.isArray(nested.owners)
    ? [...nested.owners].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    : [];
  for (const owner of ownerRows) {
    const email = String(owner?.email ?? '').trim();
    if (looksLikeEmail(email)) return email;
  }

  const flatOwnerEmail = String(nested.ownerEmail ?? '').trim();
  if (looksLikeEmail(flatOwnerEmail)) return flatOwnerEmail;

  const businessEmail = String(nested.business?.email ?? '').trim();
  if (looksLikeEmail(businessEmail)) return businessEmail;

  return '';
};

const decisionButtonBase =
  'rounded-md text-white h-auto min-h-[3.75rem] py-2.5 px-3 box-border cursor-pointer flex flex-col gap-1 items-center justify-center text-center w-full overflow-hidden transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand)] disabled:opacity-50 disabled:cursor-not-allowed';

/** Shared height for MyNotes + decision sidebar when shown side-by-side. */
const DECISION_PANEL_HEIGHT_CLASS = 'h-[560px]';

type FundingCallProps = {
  applicationId?: string;
  /** Refetch application detail after save (e.g. when backend moves currentQueue to Funding Call). */
  onSaved?: () => void;
  /** Notify parent when call status changes (saved or in-form selection). */
  onCallStatusChange?: (status: string) => void;
};

interface CallFormState {
  callStatus: string;
  applicationStatus: string;
  remarks: string;
  followUpDate: string;
}

export const FundingCall = ({ applicationId, onSaved, onCallStatusChange }: FundingCallProps) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const dispatch = useDispatch<AppDispatch>();
  const { loading: saving, success, error } = useSelector(
    (state: RootState) => state.createFundingCall,
  );
  const { data: existingCalls, loading: fetchingExistingCalls } = useSelector(
    (state: RootState) => state.fundingCalls,
  );
  const loginUser = useSelector((state: RootState) => state.login?.data?.user);
  const applicationDetail = useSelector((state: RootState) => state.applicationDetail.data);

  const linkedClientEmail = useMemo(
    () => resolveLinkedClientEmail(applicationDetail),
    [applicationDetail],
  );

  /** Numeric applicationId (preferred) or _id for offer-decision read/write in the approval modal. */
  const offerApplicationId = useMemo(() => {
    const data = applicationDetail as
      | { applicationId?: string | number; _id?: string; id?: string }
      | null;
    return data?.applicationId ?? data?._id ?? data?.id ?? applicationId ?? null;
  }, [applicationDetail, applicationId]);

  const requestLoanAmount = useMemo(() => {
    const raw = (applicationDetail as { loanAmount?: number | string | null } | null)
      ?.loanAmount;
    if (raw == null) return null;
    const num = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(num) ? num : null;
  }, [applicationDetail]);

  /** UUID (_id) used to refetch the application detail after an offer edit. */
  const applicationUuid = useMemo(() => {
    const data = applicationDetail as { _id?: string; id?: string } | null;
    return data?._id ?? data?.id ?? applicationId ?? null;
  }, [applicationDetail, applicationId]);

  const needsContractReinitiation = useMemo(
    () => applicationNeedsContractReinitiation(applicationDetail as Record<string, unknown> | null),
    [applicationDetail],
  );

  const roleKey = normalizeRoleKey(resolveEffectiveRole(loginUser));
  const isSuperAdmin = roleKey === 'SUPER_ADMIN';
  const isOperations = roleKey === 'OPERATIONS';
  const isUnderwriter = roleKey === 'UNDERWRITER';
  /** Super Admin, Operations and Underwriter can put a deal on hold from the funding-call sidebar. */
  const canHoldDeal = isSuperAdmin || isOperations || isUnderwriter;
  /** The decision sidebar renders for any role allowed to act on the deal here. */
  const showDecisionSidebar = isSuperAdmin || isOperations || isUnderwriter;

  const applicationQueue = useMemo(() => {
    const data = applicationDetail as { currentQueue?: string; queue?: string } | null;
    return data?.currentQueue ?? data?.queue ?? '';
  }, [applicationDetail]);

  const applicationState = useMemo(() => {
    const data = applicationDetail as { currentState?: string; state?: string } | null;
    return data?.currentState ?? data?.state ?? '';
  }, [applicationDetail]);

  const normalizeQueueKey = (value: string | null | undefined) =>
    String(value ?? '')
      .trim()
      .replace(/[\s_-]+/g, '')
      .toLowerCase();

  const isAtDisbursementQueue = useMemo(() => {
    const q = normalizeQueueKey(applicationQueue);
    return q === 'disbursement' || q === 'disbursment';
  }, [applicationQueue]);

  const isAtHoldQueue = useMemo(() => {
    const queueHeld = normalizeQueueKey(applicationQueue) === 'onhold';
    const stateHeld = normalizeQueueKey(applicationState) === 'onhold';
    return queueHeld || stateHeld;
  }, [applicationQueue, applicationState]);

  const [form, setForm] = useState<CallFormState>({
    callStatus: '',
    applicationStatus: '',
    remarks: '',
    followUpDate: '',
  });

  // UI States
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [errors, setErrors] = useState({ callStatus: false });
  const [showSuccess, setShowSuccess] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Calendar state
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [isoResendModalOpen, setIsoResendModalOpen] = useState(false);
  /** True once the Super Admin edits the offer terms — unlocks the ISO resend + contract reinitiation CTA. */
  const [offerUpdated, setOfferUpdated] = useState(false);
  const [isSendingFinalApproval, setIsSendingFinalApproval] = useState(false);
  const [approveForDisbursementPending, setApproveForDisbursementPending] = useState(false);
  const [holdingDeal, setHoldingDeal] = useState(false);
  const [dealOnHold, setDealOnHold] = useState(false);
  const [disbursementApproved, setDisbursementApproved] = useState(false);
  const [disbursementEmailSent, setDisbursementEmailSent] = useState<boolean | null>(null);
  const [disbursementEmailSkippedReason, setDisbursementEmailSkippedReason] = useState<string | null>(
    null,
  );
  const calendarRef = useRef<HTMLDivElement | null>(null);

  const options = ["Call Done", "Not Reachable", "Call Back Later", "Rejected", "Interested"];

  const isBusy =
    saving ||
    fetchingExistingCalls ||
    approveForDisbursementPending ||
    isSendingFinalApproval ||
    holdingDeal;

  const latestFromCalls = useMemo(() => {
    if (!existingCalls?.length) return '';
    return (existingCalls[0] as { callStatus?: string })?.callStatus ?? '';
  }, [existingCalls]);

  const isApprovedForDisbursement = useMemo(() => {
    if (disbursementApproved || isAtDisbursementQueue) return true;
    const status = form.callStatus || latestFromCalls;
    return normalizeFundingCallStatus(status) === 'approvedfordisbursement';
  }, [disbursementApproved, isAtDisbursementQueue, form.callStatus, latestFromCalls]);

  useEffect(() => {
    const status = form.callStatus || latestFromCalls;
    if (
      isAtDisbursementQueue ||
      normalizeFundingCallStatus(status) === 'approvedfordisbursement'
    ) {
      setDisbursementApproved(true);
    }
  }, [isAtDisbursementQueue, form.callStatus, latestFromCalls]);

  useEffect(() => {
    if (isBusy) setShowSuccess(false);
  }, [isBusy]);

  // Close dropdown / calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (calendarRef.current && !calendarRef.current.contains(target)) {
        setIsCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-fetch existing funding calls on page load / applicationId change
  useEffect(() => {
    if (applicationId) {
      dispatch(getFundingCalls({ application: applicationId }));
    }
  }, [applicationId, dispatch]);

  // When existing calls load, populate form from latest entry
  useEffect(() => {
    if (!existingCalls || existingCalls.length === 0) {
      onCallStatusChange?.('');
      return;
    }
    const latest = existingCalls[0];
    const callStatus = latest.callStatus || '';
    setForm((prev) => ({
      ...prev,
      callStatus,
      applicationStatus: latest.applicationStatus || '',
      remarks: latest.remarks || '',
      followUpDate: latest.followUpDate
        ? new Date(latest.followUpDate).toLocaleDateString('en-US')
        : '',
    }));
    onCallStatusChange?.(callStatus);
  }, [existingCalls, onCallStatusChange]);

  const submitFundingCall = (data: CallFormState) => {
    if (!data.callStatus) {
      setErrors({ callStatus: true });
      return;
    }

    if (!applicationId) {
      toast.error('Application ID is missing for this funding call.');
      return;
    }

    dispatch(
      createFundingCall({
        application: applicationId,
        callStatus: data.callStatus,
        applicationStatus: data.applicationStatus || null,
        remarks: data.remarks || null,
        followUpDate: data.followUpDate || null,
      }),
    );
  };

  const handleSelect = (status: string) => {
    if (isBusy) return;
    setIsDropdownOpen(false);

    if (status === 'Rejected') {
      setRejectModalOpen(true);
      return;
    }

    const snapshot: CallFormState = { ...form, callStatus: status };
    setForm(snapshot);
    setErrors({ callStatus: false });
    onCallStatusChange?.(status);
  };

  const handleAfterReject = async (reason: string) => {
    if (!applicationId) {
      toast.error('Application ID is missing for this funding call.');
      throw new Error('Application ID is missing');
    }

    const snapshot: CallFormState = { ...form, callStatus: 'Rejected' };
    setForm(snapshot);
    setErrors({ callStatus: false });
    onCallStatusChange?.('Rejected');

    await dispatch(
      createFundingCall({
        application: applicationId,
        callStatus: 'Rejected',
        applicationStatus: form.applicationStatus || null,
        remarks: reason,
        followUpDate: form.followUpDate || null,
      }),
    ).unwrap();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // React to Redux createFundingCall result
  useEffect(() => {
    if (success) {
      setShowSuccess(true);
      const declined = form.callStatus === 'Rejected';
      if (!declined) {
        toast.success('Funding call saved successfully.');
      }
      onSaved?.();
      dispatch(resetCreateFundingCall());
    }
  }, [success, dispatch, onSaved, form.callStatus]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleSave = () => {
    if (form.callStatus === 'Rejected') {
      setRejectModalOpen(true);
      return;
    }
    submitFundingCall(form);
  };

  const isApproveActionComplete = isApprovedForDisbursement && disbursementEmailSent === true;

  const handleApproveForDisbursement = useCallback(async (overrideClientEmail?: string): Promise<boolean> => {
    if (!applicationId) {
      toast.error('Application ID is missing for this funding call.');
      return false;
    }
    if (isApproveActionComplete) return false;

    const approvalEmailHtml = renderApplicationApprovedEmailHtml(
      buildApplicationApprovedEmailServerPlaceholderValues(),
    );

    const clientEmail = (overrideClientEmail ?? linkedClientEmail).trim();

    setApproveForDisbursementPending(true);
    const toastId = toast.loading('Approving application for disbursement...');

    try {
      const result = await dispatch(
        approveFundingCallForDisbursement({
          application: applicationId,
          clientEmail: clientEmail || undefined,
          emailHtml: approvalEmailHtml,
          emailSubject: APPLICATION_APPROVED_EMAIL_SUBJECT,
        }),
      ).unwrap();

      setDisbursementApproved(true);
      setForm((prev) => ({
        ...prev,
        callStatus: 'Approved for Disbursement',
        applicationStatus: 'Approved for Disbursement',
      }));
      onCallStatusChange?.('Approved for Disbursement');

      if (applicationId) {
        void dispatch(getFundingCalls({ application: applicationId }));
      }

      const emailSent = Boolean(result?.emailSent);
      const skippedReason =
        typeof result?.emailSkippedReason === 'string' ? result.emailSkippedReason : null;

      setDisbursementEmailSent(emailSent);
      setDisbursementEmailSkippedReason(emailSent ? null : skippedReason);

      toast.update(toastId, {
        render: emailSent
          ? 'Application approved for disbursement. Client emailed and Operations notified.'
          : skippedReason ||
            result?.message ||
            'Application approved for disbursement. Operations has been notified.',
        type: emailSent ? 'success' : 'warning',
        isLoading: false,
        autoClose: 5000,
      });

      onSaved?.();
      return true;
    } catch (err: unknown) {
      const message =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message ||
            'Failed to approve application for disbursement.';
      toast.update(toastId, {
        render: message,
        type: 'error',
        isLoading: false,
        autoClose: 5000,
      });
      return false;
    } finally {
      setApproveForDisbursementPending(false);
    }
  }, [
    applicationId,
    dispatch,
    isApproveActionComplete,
    linkedClientEmail,
    onCallStatusChange,
    onSaved,
  ]);

  const handleConfirmApproval = useCallback(
    async (clientEmail: string) => {
      const ok = await handleApproveForDisbursement(clientEmail);
      if (ok) setApproveModalOpen(false);
    },
    [handleApproveForDisbursement],
  );

  const refreshApplicationDetail = useCallback(() => {
    if (applicationUuid) {
      void dispatch(getApplicationById(String(applicationUuid)));
    }
  }, [applicationUuid, dispatch]);

  /** After the offer terms are edited (in the approval modal), surface the final-approval CTA. */
  const handleOfferUpdated = useCallback(() => {
    setOfferUpdated(true);
    refreshApplicationDetail();
  }, [refreshApplicationDetail]);

  /** Move the application's currentQueue and currentState to "On Hold". */
  const handleHoldDeal = useCallback(async () => {
    const recordId = applicationUuid ?? applicationId;
    if (!recordId) {
      toast.error('Application ID is missing for this funding call.');
      return;
    }
    setHoldingDeal(true);
    const toastId = toast.loading('Putting the deal on hold...');
    try {
      await dispatch(
        updateApplicationQueue({
          id: String(recordId),
          data: { currentQueue: 'On Hold' },
        }),
      ).unwrap();
      setDealOnHold(true);
      onCallStatusChange?.('On Hold');
      refreshApplicationDetail();
      toast.update(toastId, {
        render: 'Deal placed on hold.',
        type: 'success',
        isLoading: false,
        autoClose: 3000,
      });
      onSaved?.();
    } catch (err: unknown) {
      const message =
        typeof err === 'string'
          ? err
          : (err as { message?: string })?.message || 'Failed to put the deal on hold.';
      toast.update(toastId, {
        render: message,
        type: 'error',
        isLoading: false,
        autoClose: 4000,
      });
    } finally {
      setHoldingDeal(false);
    }
  }, [
    applicationId,
    applicationUuid,
    dispatch,
    onCallStatusChange,
    onSaved,
    refreshApplicationDetail,
  ]);

  const finalApprovalTarget = useMemo(
    () =>
      resolveFinalApprovalTargetUnderwriter(
        (applicationDetail ?? {}) as Parameters<typeof resolveFinalApprovalTargetUnderwriter>[0],
      ),
    [applicationDetail],
  );
  const approvingUnderwriterId = finalApprovalTarget?.id ?? '';
  const isFinalApprovalStage = useMemo(
    () => isApplicationInFinalApprovalStage(applicationDetail as Record<string, unknown> | null),
    [applicationDetail],
  );
  const approvingUnderwriterName = useMemo(() => {
    if (finalApprovalTarget) {
      const fn = String(finalApprovalTarget.user?.firstName ?? '').trim();
      const ln = String(finalApprovalTarget.user?.lastName ?? '').trim();
      const full = [fn, ln].filter(Boolean).join(' ');
      if (full) return full;
      if (finalApprovalTarget.user?.email?.trim()) return finalApprovalTarget.user.email.trim();
    }
    return formatApprovedByUnderwriterLabel(
      (applicationDetail ?? {}) as Parameters<typeof formatApprovedByUnderwriterLabel>[0],
    );
  }, [applicationDetail, finalApprovalTarget]);

  const showResendApprovalMailToIso =
    isSuperAdmin && needsContractReinitiation && !offerUpdated;

  const handleSendForFinalUnderwriterApproval = useCallback(async (): Promise<boolean> => {
    const recordId = applicationUuid ?? applicationId;
    if (!recordId) {
      toast.error('Missing application id. Please reload and try again.');
      return false;
    }
    if (!approvingUnderwriterId) {
      toast.error('No approving Underwriter is recorded for this application.');
      return false;
    }
    setIsSendingFinalApproval(true);
    const toastId = toast.loading('Sending to Underwriter for final approval...');
    try {
      await dispatch(
        sendApplicationForFinalUnderwriterApproval({
          applicationId: String(recordId),
          source: FINAL_APPROVAL_SOURCE_FUNDING_CALL,
        }),
      ).unwrap();
      refreshApplicationDetail();
      toast.update(toastId, {
        render: approvingUnderwriterName
          ? `Application sent to ${approvingUnderwriterName} for final approval.`
          : 'Application sent to the approving Underwriter for final approval.',
        type: 'success',
        isLoading: false,
        autoClose: 3000,
      });
      return true;
    } catch (err: unknown) {
      const message =
        typeof err === 'string'
          ? err
          : 'Failed to send application for final Underwriter approval. Please try again.';
      toast.update(toastId, {
        render: message,
        type: 'error',
        isLoading: false,
        autoClose: 4000,
      });
      return false;
    } finally {
      setIsSendingFinalApproval(false);
    }
  }, [
    applicationId,
    applicationUuid,
    approvingUnderwriterId,
    approvingUnderwriterName,
    dispatch,
    refreshApplicationDetail,
  ]);

  // Reset the local offer-updated flag when switching applications.
  useEffect(() => {
    setOfferUpdated(false);
    setDealOnHold(false);
  }, [offerApplicationId]);

  const isDealHeld = dealOnHold || isAtHoldQueue;

  // Offer edits made elsewhere (e.g. contract tab) also unlock the final-approval CTA.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { applicationId?: unknown } | undefined;
      if (offerDecisionUpdateMatchesApplication(detail?.applicationId, offerApplicationId)) {
        setOfferUpdated(true);
        refreshApplicationDetail();
      }
    };
    window.addEventListener(OFFER_DECISION_UPDATED_EVENT, handler);
    return () => window.removeEventListener(OFFER_DECISION_UPDATED_EVENT, handler);
  }, [offerApplicationId, refreshApplicationDetail]);

  return (
    <div
      className={cn(
        'relative mx-auto rounded-lg border border-slate-200/80 bg-white p-4 font-sans shadow-sm',
        'dark:border-slate-700 dark:bg-[#1c1d21] dark:shadow-black/20',
      )}
    >
      {(fetchingExistingCalls || saving) && (
        <div
          className={cn(
            'mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
            fetchingExistingCalls
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/45 dark:text-blue-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200',
          )}
        >
          <span>{saving ? '⏳' : '⏳'}</span>
          {fetchingExistingCalls ? 'Loading existing call details...' : 'Saving... please wait'}
        </div>
      )}

      {showSuccess && (
        <div
          className={cn(
            'mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800',
            'dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200',
          )}
        >
          <span>✓</span>{' '}
          {form.callStatus === 'Rejected'
            ? 'Application declined successfully.'
            : 'Application status updated successfully.'}
        </div>
      )}

      {/* Header + Call Status */}
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="order-2 flex w-full flex-col gap-1 lg:order-1 lg:w-1/2 lg:shrink-0" ref={dropdownRef}>
          <label className="text-xs font-medium text-slate-900 dark:text-slate-100">
            Call Status <span className="text-red-500">*</span>
          </label>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (isBusy) return;
                setIsDropdownOpen(!isDropdownOpen);
              }}
              disabled={isBusy}
              className={cn(
                'flex w-full cursor-pointer items-center justify-between rounded-lg border bg-white px-3 py-2 text-left text-sm',
                'dark:bg-slate-900 dark:text-slate-100',
                errors.callStatus
                  ? 'border-red-500 dark:border-red-500'
                  : 'border-slate-300 dark:border-slate-600',
                form.callStatus ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
                isBusy && 'cursor-not-allowed opacity-60',
              )}
            >
              {form.callStatus || 'Select call status'}
              <span
                className="text-[10px] transition-transform duration-200"
                style={{ transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0)' }}
              >
                ▼
              </span>
            </button>

            {isDropdownOpen && (
              <div
                className={cn(
                  'absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 shadow-lg',
                  'dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/40',
                )}
              >
                {options.map((opt) => (
                  <div
                    key={opt}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSelect(opt)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelect(opt);
                      }
                    }}
                    className={cn(
                      'cursor-pointer rounded-md px-3 py-2 text-xs transition-colors',
                      form.callStatus === opt
                        ? 'bg-blue-50 font-semibold text-blue-900 dark:bg-blue-950/50 dark:text-blue-200'
                        : 'font-normal text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
                    )}
                  >
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>
          {errors.callStatus && (
            <span className="text-[11px] text-red-700 dark:text-red-400">Call status is required</span>
          )}
        </div>

        <div className="order-1 min-w-0 lg:order-2 lg:ml-auto lg:w-1/2 lg:text-right">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <h2 className="m-0 text-lg font-bold text-slate-900 dark:text-slate-100">Funding Call</h2>
            {applicationId && (
              <div
                className={cn(
                  'rounded-full border border-blue-200/80 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700',
                  'dark:border-blue-800/60 dark:bg-blue-500/15 dark:text-blue-300',
                )}
              >
                ID: {applicationId}
              </div>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Capture the latest call outcome.
          </p>
        </div>
      </div>

      {/* Follow-up Date */}
      {form.callStatus === 'Call Back Later' && (
        <div className="relative mb-3 max-w-[220px]" ref={calendarRef}>
          <label
            className="mb-1 block text-xs font-medium text-slate-900 dark:text-slate-100"
          >
            Next Follow-up Date
          </label>
          <div className="relative">
            <input
              type="text"
              name="followUpDate"
              placeholder="MM/DD/YYYY"
              value={form.followUpDate}
              onChange={handleChange}
              onFocus={() => {
                if (isBusy) return;
                setIsCalendarOpen(true);
              }}
              disabled={isBusy}
              className={cn(
                'w-full rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-9 text-xs text-slate-900 placeholder:text-slate-400',
                'dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500',
                isBusy && 'cursor-not-allowed opacity-60',
              )}
            />
            <button
              type="button"
              onClick={() => {
                if (isBusy) return;
                setIsCalendarOpen((prev) => !prev);
              }}
              disabled={isBusy}
              className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer border-none bg-transparent text-sm text-slate-400 dark:text-slate-500"
            >
              📅
            </button>
          </div>

          {isCalendarOpen && (
            <div
              className={cn(
                'absolute left-0 top-full z-40 mt-1.5 w-[260px] rounded-xl border border-slate-200 bg-white p-2.5 shadow-xl',
                'dark:border-slate-600 dark:bg-slate-900 dark:shadow-black/50',
              )}
            >
              <div className="mb-2 flex items-center justify-between text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    if (isBusy) return;
                    setCalendarMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                    );
                  }}
                  disabled={isBusy}
                  className="cursor-pointer border-none bg-transparent p-1 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
                >
                  ‹
                </button>
                <span>
                  {calendarMonth.toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (isBusy) return;
                    setCalendarMonth(
                      (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                    );
                  }}
                  disabled={isBusy}
                  className="cursor-pointer border-none bg-transparent p-1 text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
                >
                  ›
                </button>
              </div>

              <div className="mb-1 grid grid-cols-7 gap-1 text-[11px] text-slate-400 dark:text-slate-500">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <div key={d} className="text-center">
                    {d}
                  </div>
                ))}
              </div>

              {(() => {
                const start = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
                const end = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
                const daysInMonth = end.getDate();
                const startDay = start.getDay();
                const cells: (number | null)[] = [];
                for (let i = 0; i < startDay; i += 1) cells.push(null);
                for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);

                return (
                  <div className="grid grid-cols-7 gap-1 text-xs">
                    {cells.map((day, idx) =>
                      day === null ? (
                        <div key={idx} />
                      ) : (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            if (isBusy) return;
                            const month = calendarMonth.getMonth() + 1;
                            const mm = month.toString().padStart(2, '0');
                            const dd = day.toString().padStart(2, '0');
                            const yyyy = calendarMonth.getFullYear();
                            const formatted = `${mm}/${dd}/${yyyy}`;
                            setForm((prev) => ({ ...prev, followUpDate: formatted }));
                            setIsCalendarOpen(false);
                          }}
                          disabled={isBusy}
                          className={cn(
                            'w-full cursor-pointer rounded-full border-none bg-slate-50 py-1.5 text-slate-900',
                            'hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700',
                            isBusy && 'cursor-not-allowed opacity-60',
                          )}
                        >
                          {day}
                        </button>
                      ),
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          'w-full',
          showDecisionSidebar && 'flex flex-row items-stretch gap-4',
        )}
      >
        <div className={cn('flex min-w-0 flex-col', showDecisionSidebar && 'flex-[7]')}>
          <MyNotes applicationId={applicationId} compact tall />
        </div>

        {showDecisionSidebar && (
          <div className="flex min-w-0 flex-[3] flex-col">
            <div
              className={cn(
                'flex w-full flex-col overflow-hidden rounded-lg border border-[#FDFDFD] pt-0 shadow-[0px_4px_20px_0px_#00000005]',
                DECISION_PANEL_HEIGHT_CLASS,
                isDark ? 'border-white bg-card' : 'bg-white',
              )}
            >
              <h2
                className={cn(
                  'w-full shrink-0 px-6 py-2 font-roboto text-base font-semibold',
                  isDark ? 'bg-card text-gray-200' : 'bg-[#F9FAFD] text-[#374151]',
                )}
              >
                {isSuperAdmin ? 'Approve for Disbursement' : 'Deal Actions'}
              </h2>

              {isSuperAdmin && (
                <ApprovedByUnderwriterBadge
                  app={
                    (applicationDetail ?? {}) as Parameters<
                      typeof ApprovedByUnderwriterBadge
                    >[0]['app']
                  }
                  fallback="an underwriter"
                  className="mx-4 shrink-0"
                />
              )}

              {isSuperAdmin && isApprovedForDisbursement && (
                <div
                  className={cn(
                    'mx-4 flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-2 text-xs',
                    disbursementEmailSent === false
                      ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200',
                  )}
                >
                  <span>{disbursementEmailSent === false ? '!' : '✓'}</span>
                  {disbursementEmailSent === true
                    ? 'Approved — client emailed and Operations notified.'
                    : disbursementEmailSent === false
                      ? disbursementEmailSkippedReason ||
                        'Approved — Operations notified, but the client email could not be sent. Retry below or add a client email on the application.'
                      : 'Approved — Operations notified.'}
                </div>
              )}

              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3',
                )}
              >
                {isSuperAdmin && (
                  <>
                <button
                  type="button"
                  onClick={() => setApproveModalOpen(true)}
                  disabled={isBusy || isApproveActionComplete}
                  className={cn(
                    decisionButtonBase,
                    'border border-[#0f7a36] bg-[linear-gradient(180deg,#16a34a_0%,#16a34a_55%,#ffffff_115%)] shadow-md shadow-green-700/25 hover:brightness-95',
                  )}
                >
                  <span className="w-full whitespace-normal break-words px-1 font-roboto text-base font-bold">
                    {approveForDisbursementPending
                      ? 'Approving…'
                      : isApproveActionComplete
                        ? 'Approved for Disbursement'
                        : isApprovedForDisbursement
                          ? 'Resend approval email'
                          : 'Approve Application'}
                  </span>
                  <span className="w-full whitespace-normal break-words px-1 text-xs font-normal leading-snug opacity-90">
                    {isApprovedForDisbursement && disbursementEmailSent === false
                      ? 'Retry sending the approval email to the client'
                      : 'Send approval email to client and notify Operations'}
                  </span>
                </button>

                {showResendApprovalMailToIso && (
                  <button
                    type="button"
                    onClick={() => setIsoResendModalOpen(true)}
                    disabled={isBusy}
                    className={cn(
                      decisionButtonBase,
                      'border border-[var(--brand-hover)] bg-[linear-gradient(180deg,var(--brand)_0%,var(--brand)_55%,#ffffff_115%)] shadow-md shadow-[var(--brand)]/25 hover:brightness-95',
                    )}
                  >
                    <span className="w-full whitespace-normal break-words px-1 font-roboto text-base font-bold">
                      Resend approval mail to ISO and reinitiate contract
                    </span>
                    <span className="w-full whitespace-normal break-words px-1 text-xs font-normal leading-snug opacity-90">
                      Offer values changed after a contract was generated. Send the updated offer
                      email and reset the contract for regeneration.
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDocumentsModalOpen(true)}
                  disabled={isBusy}
                  className={cn(
                    decisionButtonBase,
                    'border border-[#c9862f] bg-[linear-gradient(180deg,#eaa95a_0%,#eaa95a_55%,#ffffff_115%)] hover:brightness-95',
                  )}
                >
                  <span className="w-full whitespace-normal break-words px-1 font-roboto text-base font-bold">
                    Send back for documents
                  </span>
                  <span className="w-full whitespace-normal break-words px-1 text-xs font-normal leading-snug opacity-90">
                    Request additional documents
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRejectModalOpen(true)}
                  disabled={isBusy}
                  className={cn(
                    decisionButtonBase,
                    'border border-[#b5261a] bg-[linear-gradient(180deg,#dc331d_0%,#dc331d_55%,#ffffff_115%)] hover:brightness-95',
                  )}
                >
                  <span className="w-full whitespace-normal break-words px-1 font-roboto text-base font-bold">
                    Decline
                  </span>
                  <span className="w-full whitespace-normal break-words px-1 text-xs font-normal leading-snug opacity-90">
                    Decline this application
                  </span>
                </button>
                  </>
                )}

                {canHoldDeal && (
                  <button
                    type="button"
                    onClick={handleHoldDeal}
                    disabled={isBusy || isDealHeld}
                    className={cn(
                      decisionButtonBase,
                      'border border-[#475569] bg-[linear-gradient(180deg,#64748b_0%,#64748b_55%,#ffffff_115%)] shadow-md shadow-slate-700/25 hover:brightness-95',
                    )}
                  >
                    <span className="w-full whitespace-normal break-words px-1 font-roboto text-base font-bold">
                      {holdingDeal ? 'Putting on hold…' : isDealHeld ? 'On Hold' : 'Hold the deal'}
                    </span>
                    <span className="w-full whitespace-normal break-words px-1 text-xs font-normal leading-snug opacity-90">
                      {isDealHeld
                        ? 'This deal is currently on hold'
                        : 'Pause this deal and set its queue to On Hold'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div
        className={cn(
          'mt-4 shrink-0 border-t border-slate-200/80 pt-4 dark:border-slate-700',
          showDecisionSidebar && 'flex flex-row gap-4',
        )}
      >
        {showDecisionSidebar && <div className="min-w-0 flex-[7]" aria-hidden="true" />}
        <div
          className={cn(
            'flex justify-end',
            showDecisionSidebar ? 'min-w-0 flex-[3]' : 'w-full',
          )}
        >
          <Button
            type="button"
            variant="default"
            onClick={handleSave}
            disabled={isBusy}
            className="min-w-[10rem] px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Send for Disbursement'}
          </Button>
        </div>
      </div>

      {isBusy && (
        <div
          aria-hidden="true"
          className="pointer-events-auto absolute inset-0 z-[999] rounded-lg bg-transparent"
        />
      )}

      <RejectApplicationModal
        open={rejectModalOpen}
        onOpenChange={setRejectModalOpen}
        onAfterReject={handleAfterReject}
        confirmLoading={saving}
      />

      <RequestMissingDocumentsModal
        open={documentsModalOpen}
        onOpenChange={setDocumentsModalOpen}
        onSuccess={() => {
          toast.success('Document request sent.');
        }}
      />

      <ApproveForDisbursementModal
        open={approveModalOpen}
        onOpenChange={setApproveModalOpen}
        applicationId={offerApplicationId}
        loanAmount={requestLoanAmount}
        defaultClientEmail={linkedClientEmail}
        confirming={approveForDisbursementPending}
        confirmLabel={
          isApprovedForDisbursement && disbursementEmailSent === false
            ? 'Resend approval email'
            : 'Approve & send email'
        }
        onConfirm={handleConfirmApproval}
        onOfferUpdated={handleOfferUpdated}
        offerUpdated={offerUpdated}
        onSendForFinalApproval={
          isSuperAdmin && approvingUnderwriterId
            ? handleSendForFinalUnderwriterApproval
            : undefined
        }
        sendingFinalApproval={isSendingFinalApproval}
        isFinalApprovalStage={isFinalApprovalStage}
      />

      {isSuperAdmin && (
        <ApprovedApplicationModal
          open={isoResendModalOpen}
          onOpenChange={setIsoResendModalOpen}
          isFinalUnderwriter
          showIsoRecipientFields
          resendApprovalEmail
          reinitiateContract={needsContractReinitiation || offerUpdated}
          onOfferUpdated={refreshApplicationDetail}
        />
      )}
    </div>
  );
};
