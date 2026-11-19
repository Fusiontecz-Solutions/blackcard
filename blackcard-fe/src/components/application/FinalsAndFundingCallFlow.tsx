import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import type { RootState } from '@/redux/store';
import { useTheme } from '@/context/ThemeContext';
import ApplicationSummary from '@/components/application/ApplicationSummary';
import { Final, areFinalAnswersComplete } from '@/pages/case/Final';
import { FundingCall } from '@/pages/case/FundingCall';
import { cn } from '@/lib/utils';

type FinalsAndFundingCallFlowProps = {
  applicationId?: string | null;
  resolvedApplicationId?: string | null;
  onBack?: () => void;
  onCallStatusChange?: (status: string) => void;
  onFundingCallSaved?: () => void;
};

const SLIDES = [
  { id: 'final', label: 'Final Questions' },
  { id: 'funding-call', label: 'Funding Call' },
] as const;

function normalizeQueueKey(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? '100%' : '-100%',
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? '-100%' : '100%',
    opacity: 0,
  }),
};

export default function FinalsAndFundingCallFlow({
  applicationId,
  resolvedApplicationId,
  onBack,
  onCallStatusChange,
  onFundingCallSaved,
}: FinalsAndFundingCallFlowProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const applicationData = useSelector((state: RootState) => state.applicationDetail.data);
  const finalAnswersState = useSelector((state: RootState) => state.finalAnswers);
  const fundingCalls = useSelector((state: RootState) => state.fundingCalls.data);

  const applicationKey = useMemo(() => {
    if (applicationId) return String(applicationId);
    if ((applicationData as { id?: string })?.id) {
      return String((applicationData as { id?: string }).id);
    }
    if ((applicationData as { applicationId?: number })?.applicationId != null) {
      return String((applicationData as { applicationId?: number }).applicationId);
    }
    return '';
  }, [applicationId, applicationData]);

  const queue = (applicationData as { currentQueue?: string })?.currentQueue;
  const queueNorm = normalizeQueueKey(queue);

  const answersForApplication =
    (applicationKey && finalAnswersState.byApplication[applicationKey]) || {};

  const finalAnswersComplete = areFinalAnswersComplete(answersForApplication);
  const hasFundingCallRecords = Array.isArray(fundingCalls) && fundingCalls.length > 0;
  const isFundingCallQueue =
    queueNorm === 'fundingcall' || (queueNorm.includes('funding') && queueNorm.includes('call'));
  // Once the application has reached the Final stage, the final step is considered
  // done, so the funding call tab must always be unlocked when the user opens it.
  const isFinalStageReached =
    queueNorm === 'final' ||
    queueNorm === 'finals' ||
    queueNorm === 'finalsandfundingcall' ||
    queueNorm.startsWith('final');

  const shouldStartOnFundingCall =
    isFundingCallQueue || hasFundingCallRecords || finalAnswersComplete;

  // The funding call tab stays unlocked once the final step is complete, the app
  // has reached the Final stage, or funding call data already exists.
  const fundingCallUnlocked =
    isFinalStageReached || shouldStartOnFundingCall;

  const [activeSlide, setActiveSlide] = useState(0);
  const [direction, setDirection] = useState(1);
  const [hasInitializedSlide, setHasInitializedSlide] = useState(false);
  const [finalStepComplete, setFinalStepComplete] = useState(false);

  useEffect(() => {
    if (finalAnswersComplete || isFinalStageReached) {
      setFinalStepComplete(true);
    }
  }, [finalAnswersComplete, isFinalStageReached]);

  useEffect(() => {
    if (hasInitializedSlide || finalAnswersState.loading) return;
    if (shouldStartOnFundingCall) {
      setActiveSlide(1);
      setFinalStepComplete(true);
    }
    setHasInitializedSlide(true);
  }, [
    hasInitializedSlide,
    finalAnswersState.loading,
    shouldStartOnFundingCall,
  ]);

  const goToSlide = useCallback((index: number) => {
    setDirection(index > activeSlide ? 1 : -1);
    setActiveSlide(index);
  }, [activeSlide]);

  const handleFinalSaveSuccess = useCallback(() => {
    setFinalStepComplete(true);
    setDirection(1);
    setActiveSlide(1);
  }, []);

  const fundingCallApplicationId =
    resolvedApplicationId != null
      ? String(resolvedApplicationId)
      : applicationKey || undefined;

  return (
    <div className="w-full space-y-5">
      <ApplicationSummary applicationId={applicationId} onBack={onBack} />

      <div className="flex flex-col gap-4">
        <div
          className="mx-auto flex w-full max-w-2xl items-center justify-center gap-0 px-2"
          role="tablist"
          aria-label="Finals and funding call steps"
        >
          {SLIDES.map((slide, index) => {
            const isActive = activeSlide === index;
            const isComplete = index === 0 ? finalStepComplete : false;
            const isLast = index === SLIDES.length - 1;
            const isDisabled = index === 1 && !finalStepComplete && !fundingCallUnlocked;

            return (
              <div key={slide.id} className="flex min-w-0 flex-1 items-center">
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    if (isDisabled) return;
                    goToSlide(index);
                  }}
                  disabled={isDisabled}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all duration-200 sm:px-5 sm:text-sm',
                    isActive && 'tab-pipeline-active border-transparent text-white shadow-md shadow-[var(--brand)]/25',
                    !isActive &&
                      isComplete &&
                      'border-[var(--brand)]/35 bg-gradient-to-b from-[var(--brand)]/12 to-[var(--brand)]/5 text-[var(--brand)] hover:border-[var(--brand)]/50 dark:from-[var(--brand)]/20 dark:to-[var(--brand)]/8 dark:text-[var(--brand-accent)]',
                    !isActive &&
                      !isComplete &&
                      (isDark
                        ? 'border-slate-600 bg-[#374151] text-white'
                        : 'border-transparent bg-[#E8E9EC80] text-black'),
                    isDisabled && 'cursor-not-allowed opacity-45',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                      isActive && 'bg-white/20 text-white',
                      !isActive &&
                        isComplete &&
                        'bg-[var(--brand)]/15 text-[var(--brand)] dark:text-[var(--brand-accent)]',
                      !isActive &&
                        !isComplete &&
                        (isDark
                          ? 'bg-white/10 text-white/90'
                          : 'bg-white/70 text-slate-700'),
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate">{slide.label}</span>
                </button>

                {!isLast ? (
                  <div
                    className={cn(
                      'mx-2 h-0.5 w-6 shrink-0 rounded-full sm:w-10',
                      finalStepComplete && index === 0
                        ? 'bg-[image:var(--brand-gradient)]'
                        : isDark
                          ? 'bg-slate-600'
                          : 'bg-[#E8E9EC]',
                    )}
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          className={cn(
            'relative min-h-0 overflow-x-hidden overflow-y-visible rounded-xl border',
            isDark
              ? 'border-slate-700 bg-[#141517]/40'
              : 'border-[#FDFDFD] bg-white shadow-[0px_4px_20px_0px_#00000005]',
          )}
        >
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
              className="w-full p-4 sm:p-5"
            >
              {activeSlide === 0 ? (
                <Final
                  applicationId={applicationId}
                  embedded
                  resetOnUnmount={false}
                  onSaveSuccess={handleFinalSaveSuccess}
                />
              ) : (
                <FundingCall
                  applicationId={fundingCallApplicationId}
                  onCallStatusChange={onCallStatusChange}
                  onSaved={onFundingCallSaved}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
