import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '@/redux/store';
import { fetchFinalAnswers, saveFinalAnswers } from '@/redux/actions/finalAnswerActions';
import { updateApplicationQueue } from '@/redux/actions/applicationActions';
import { resetAnswersForApplication, setAnswerLocally } from '@/redux/slices/finalAnswerSlice';
import { toast } from 'react-toastify';
import ApplicationSummary from '@/components/application/ApplicationSummary';

const textareaFieldClass =
  'w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-sm md:text-base text-gray-700 bg-white leading-5 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40 focus:border-[var(--brand)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-[var(--brand)]/30 dark:focus:border-[var(--brand)]';
const selectFieldClass =
  'w-full cursor-pointer border border-gray-200 rounded-md px-2.5 py-1.5 text-sm md:text-base text-gray-700 bg-white leading-5 focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/40 focus:border-[var(--brand)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-[var(--brand)]/30 dark:focus:border-[var(--brand)]';

const AutoResizeTextarea = ({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = (target: HTMLTextAreaElement) => {
    target.style.height = 'inherit';
    target.style.height = `${target.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) resize(el);
  }, [value]);

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    resize(target);
    onChange(target.value);
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={handleInput}
      onFocus={(e) => resize(e.currentTarget)}
      className={`${className ?? ''} resize-none overflow-hidden`.trim()}
      style={{ minHeight: '34px' }}
    />
  );
};

type FinalProps = {
  applicationId?: string | null;
  onBack?: () => void;
  /** When true, omits page shell and ApplicationSummary (for carousel parent). */
  embedded?: boolean;
  /** When false, keeps fetched answers in Redux after unmount (carousel handoff). */
  resetOnUnmount?: boolean;
  /** Called after answers save successfully (and queue update when applicable). */
  onSaveSuccess?: () => void;
};

export const FINAL_FORM_FIELDS = [
    { key: 'nature_business', label: 'NATURE OF THE BUSINESS' },
    { key: 'business_duration', label: 'HOW LONG IN BUSINESS?' },
    { key: 'previous_experience', label: 'PREVIOUS EXPERIENCE' },
    { key: 'existing_business_purchase', label: 'BOUGHT EXISTING OR ESTABLISHED?' },
    { key: 'ownership_percentage', label: 'PERCENTAGE OF OWNERSHIP' },
    { key: 'location_count', label: 'HOW MANY LOCATIONS?' },
    { key: 'current_location_duration', label: 'HOW LONG IN CURRENT LOCATION?' },
    { key: 'lease_or_own', label: 'LEASE OR OWN - CURRENT?' },
    { key: 'relocation_plan', label: 'ANY PLANS TO RELOCATE?' },
    { key: 'employee_count', label: 'HOW MANY EMPLOYEES?' },
    { key: 'payroll_type', label: 'PAYROLL TYPE' },
    { key: 'payroll_frequency', label: 'PAYROLL FREQUENCY' },
    { key: 'payroll_processor', label: 'PAYROLL PROCESSOR' },
    { key: 'bank_accounts_count', label: 'HOW MANY BANK ACCTS FOR BIZ?' },
    { key: 'receivables_advertise', label: 'MAJORITY OF RECEIVABLES | ADVERTISE?' },
    { key: 'use_of_funds', label: 'USE OF FUNDS' },
    { key: 'purchase_agreement_read', label: 'DID YOU READ AND SIGNED OUR PURCHASE AGREEMENT?' },
    { key: 'understand_funding_fees', label: 'DO YOU UNDERSTAND THE FUNDING, AND AGREE WITH ALL OF THE FEES?' },
    { key: 'personal_guarantee_understood', label: 'DO YOU UNDERSTAND THE PERSONAL GUARANTEE ON OUR AGREEMENT?' },
    { key: 'afford_existing_positions', label: 'WILL YOUR BUSINESS BE ABLE TO COMFORTABLY AFFORD ALL EXISTING MCA POSITIONS?' },
    { key: 'additional_funding_mentioned', label: 'HAS iso MENTIONED ADDITIONAL FUNDING INCLUDING ALTERNATIVE LOC?' },
    { key: 'bankruptcy_last_6_months', label: 'HAVE YOU FILED FOR BK OR RESTRUCTURE THE LAST 6 MONTHS?' },
    { key: 'fraud_acknowledgement', label: 'DO YOU ACKNOWLEDGE THAT ANY FALSE STATEMENTS MAY CONSTITUTE FRAUD AND SUBJECT YOU TO LEGAL ACTION?' },
] as const;

export function areFinalAnswersComplete(
  answersForApplication: Record<string, { answer?: string | null } | undefined>,
): boolean {
  return FINAL_FORM_FIELDS.every((field) => {
    const answer = answersForApplication[field.key]?.answer;
    return typeof answer === 'string' && answer.trim() !== '';
  });
}

const yesNoQuestionKeys = new Set<string>([
  'existing_business_purchase',
  'relocation_plan',
  'purchase_agreement_read',
  'understand_funding_fees',
  'personal_guarantee_understood',
  'afford_existing_positions',
  'additional_funding_mentioned',
  'bankruptcy_last_6_months',
  'fraud_acknowledgement',
]);
const payrollFrequencyOptions = ['Daily', 'Weekly', 'Bi-weekly', 'Monthly'] as const;
const leaseOrOwnOptions = ['Lease', 'Own'] as const;
const businessDurationOptions = [
  'Less than 6 months',
  '6-12 months',
  '1-2 years',
  '2-5 years',
  '5+ years',
] as const;

export const Final = ({
  applicationId,
  onBack,
  embedded = false,
  resetOnUnmount = true,
  onSaveSuccess,
}: FinalProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const { data: applicationData } = useSelector(
    (state: RootState) => state.applicationDetail
  );
  const finalAnswersState = useSelector((state: RootState) => state.finalAnswers);

  const applicationKey = useMemo(() => {
    if (applicationId) return String(applicationId);
    if ((applicationData as any)?.id) return String((applicationData as any).id);
    if ((applicationData as any)?.applicationId != null) {
      return String((applicationData as any).applicationId);
    }
    return '';
  }, [applicationId, applicationData]);

  const formFields = FINAL_FORM_FIELDS;

  const answersForApplication =
    (applicationKey && finalAnswersState.byApplication[applicationKey]) || {};

  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle] = useState('');
  const [modalText] = useState('');

  useEffect(() => {
    if (!applicationKey) return;
    dispatch(fetchFinalAnswers({ applicationId: applicationKey }));

    return () => {
      if (resetOnUnmount) {
        dispatch(resetAnswersForApplication({ applicationId: applicationKey }));
      }
    };
  }, [applicationKey, dispatch, resetOnUnmount]);

  const handleChange = (key: string, label: string, value: string) => {
    if (!applicationKey) return;
    dispatch(
      setAnswerLocally({
        applicationId: applicationKey,
        questionKey: key,
        questionLabel: label,
        value,
      })
    );
  };

  const handleSaveAll = async () => {
    if (!applicationKey) return;
    const answers = formFields.map((field) => ({
      questionKey: field.key,
      questionLabel: field.label,
      answer: (answersForApplication[field.key]?.answer as string) || '',
    }));

    try {
      setIsSaving(true);
      await dispatch(
        saveFinalAnswers({
          applicationId: applicationKey,
          answers,
        })
      ).unwrap();

      const app = applicationData as {
        _id?: string;
        id?: string;
        applicationId?: number;
      } | null;
      const updateId =
        app?._id ?? app?.id ?? (app?.applicationId != null ? String(app.applicationId) : null);

      if (updateId) {
        try {
          await dispatch(
            updateApplicationQueue({
              id: updateId,
              data: { currentQueue: 'Final' },
            }),
          ).unwrap();
          toast.success('Merchant interview answers saved and application moved to Final.');
        } catch (queueErr: unknown) {
          console.error('Failed to move application to Final stage:', queueErr);
          toast.warning(
            'Answers saved, but the deal could not be moved to the Final stage. Check permissions or try again.',
          );
          onSaveSuccess?.();
          return;
        }
      } else {
        toast.success('Merchant interview answers saved successfully.');
      }
      onSaveSuccess?.();
    } catch (error: unknown) {
      toast.error(
        error != null ? String(error) : 'Failed to save merchant interview answers',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!applicationKey) return;
    dispatch(resetAnswersForApplication({ applicationId: applicationKey }));
  };

  // const handleOpenModal = (label: string, value: string) => {
  //   setModalTitle(label);
  //   setModalText(value);
  //   setIsModalOpen(true);
  // };

  return (
    <div
      className={
        embedded
          ? 'w-full'
          : 'min-h-screen bg-gray-50 bg-transparent px-3 py-3 md:px-5 md:py-5 dark:bg-transparent'
      }
    >
      <div className={embedded ? 'w-full' : 'max-w-8xl mx-auto flex flex-col gap-4'}>
        {!embedded ? (
          <ApplicationSummary applicationId={applicationId} onBack={onBack} />
        ) : null}

        {/* Form Section - Now its own white card */}
        <div className="bg-white px-3 py-4 md:px-5 md:py-5 rounded-lg shadow-md dark:border dark:border-slate-700 dark:bg-[#141517] dark:shadow-lg dark:shadow-black/20">
          <div className="mb-4 border-b border-gray-200 pb-2 dark:border-slate-700">
            <h2 className="text-sm md:text-md font-bold text-gray-700 dark:text-slate-100">
              Merchant Interview
            </h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-x-4 gap-y-3">
            {formFields.map((field) => (
              <div
                key={field.key}
                className="flex flex-col gap-1.5 bg-gray-50/40 rounded-md px-2.5 py-2 dark:bg-slate-800/40"
              >
                <label className="text-[11px] md:text-xs font-medium text-gray-700 uppercase tracking-wide leading-snug dark:text-slate-300">
                  {field.label}
                </label>
                <div className="flex items-start gap-2">
                  {field.key === 'business_duration' ? (
                    <select
                      className={selectFieldClass}
                      value={(answersForApplication[field.key]?.answer as string) || ''}
                      onChange={(e) => handleChange(field.key, field.label, e.target.value)}
                    >
                      <option value="">Select</option>
                      {businessDurationOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.key === 'payroll_frequency' ? (
                    <select
                      className={selectFieldClass}
                      value={(answersForApplication[field.key]?.answer as string) || ''}
                      onChange={(e) => handleChange(field.key, field.label, e.target.value)}
                    >
                      <option value="">Select</option>
                      {payrollFrequencyOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.key === 'lease_or_own' ? (
                    <select
                      className={selectFieldClass}
                      value={(answersForApplication[field.key]?.answer as string) || ''}
                      onChange={(e) => handleChange(field.key, field.label, e.target.value)}
                    >
                      <option value="">Select</option>
                      {leaseOrOwnOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : yesNoQuestionKeys.has(field.key) ? (
                    <select
                      className={selectFieldClass}
                      value={(answersForApplication[field.key]?.answer as string) || ''}
                      onChange={(e) => handleChange(field.key, field.label, e.target.value)}
                    >
                      <option value="">Select</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  ) : (
                    <AutoResizeTextarea
                      className={textareaFieldClass}
                      value={(answersForApplication[field.key]?.answer as string) || ''}
                      onChange={(val) => handleChange(field.key, field.label, val)}
                    />
                  )}
                  {/* <button
                    type="button"
                    onClick={() =>
                      handleOpenModal(
                        field.label,
                        (answersForApplication[field.key]?.answer as string) || ''
                      )
                    }
                    className="shrink-0 px-2 py-1 text-[10px] font-semibold text-[#1e60a3] border border-[#1e60a3]/40 rounded-md bg-white hover:bg-[#1e60a3]/5"
                  >
                    View
                  </button> */}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-2 md:gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 md:px-4 py-2 cursor-pointer text-xs font-semibold text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Reset Form
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving || finalAnswersState.saving}
              className="px-3 md:px-4 py-2 text-xs cursor-pointer font-semibold text-white bg-[image:var(--brand-gradient)] hover:opacity-90 rounded-md disabled:opacity-60"
            >
              {isSaving || finalAnswersState.saving ? 'Saving...' : 'Save Answers'}
            </button>
          </div>
        </div>
      </div>

      {/* Full answer modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 dark:bg-black/60">
          <div className="max-w-lg w-[90%] md:w-[500px] bg-white rounded-lg shadow-xl p-5 dark:border dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-800 dark:text-slate-100">{modalTitle}</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs font-semibold text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Close
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md px-3 py-2 bg-gray-50 text-xs text-gray-800 whitespace-pre-wrap break-words dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {modalText || 'No answer entered yet.'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};