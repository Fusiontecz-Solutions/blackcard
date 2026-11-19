import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { axiosGet, axiosPost, axiosPut } from '@/redux/axios';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'react-toastify';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  BILLING_TRANSMISSION_METHOD_OPTIONS,
  BUSINESS_WEEKDAYS,
  formatBillingTransmissionOptionLabel,
  isStandardBillingTransmissionMethod,
  PROCESSOR_OPTIONS,
  PAYMENT_FREQUENCY_OPTIONS,
  formatWeekdayLabel,
  inputSelectClass,
  normalizeBusinessWeekday,
} from './syndicatorAdminFormOptions';

/** Processors on billing are only used when the corresponding rail is ACH. */
function isAchTransmission(method: string): boolean {
  return String(method ?? '').trim().toUpperCase() === 'ACH';
}

const processorSelectDisabledClass =
  'disabled:cursor-not-allowed disabled:bg-muted/70 disabled:text-muted-foreground disabled:opacity-70 dark:disabled:bg-muted/40 disabled:border-muted';

const ADD_BANK_SELECT_VALUE = '__add_bank__';

const SYNDICATOR_BANK_ACCOUNT_TYPES = ['SAVINGS', 'CHECKING', 'BUSINESS', 'OTHER'] as const;

type NewBankFormState = {
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  branch: string;
  nameOnVoidedCheck: string;
  accountType: (typeof SYNDICATOR_BANK_ACCOUNT_TYPES)[number];
};

function emptyNewBankForm(): NewBankFormState {
  return {
    bankName: '',
    routingNumber: '',
    accountNumber: '',
    branch: '',
    nameOnVoidedCheck: '',
    accountType: 'SAVINGS',
  };
}

type BankRow = {
  id?: number;
  bankName?: string;
  routingNumber?: string;
  accountNumber?: string;
  branch?: string | null;
  accountType?: string;
};

function pickSyndicatorPayment(raw: Record<string, unknown>): Record<string, unknown> | null {
  const ps =
    raw.SyndicatorPaymentSetting ??
    raw.syndicatorPaymentSetting ??
    (raw as { syndicator_payment_setting?: unknown }).syndicator_payment_setting;
  return ps && typeof ps === 'object' && !Array.isArray(ps) ? (ps as Record<string, unknown>) : null;
}

function pickBankList(raw: Record<string, unknown>): BankRow[] {
  const banks =
    raw.SyndicatorBankInformation ??
    raw.syndicatorBankInformation ??
    (raw as { syndicator_bank_information?: unknown }).syndicator_bank_information;
  return Array.isArray(banks) ? (banks as BankRow[]) : [];
}

function formatBankDropdownLabel(b: BankRow): string {
  const name = b.bankName ?? 'Bank';
  const routing = b.routingNumber != null && String(b.routingNumber).trim() !== '' ? String(b.routingNumber) : '—';
  const acct =
    b.accountNumber != null && String(b.accountNumber).trim() !== '' ? String(b.accountNumber) : '—';
  return `${name} (${routing} / ${acct})`;
}

type BillingFormFields = {
  paymentMethod: string;
  paymentProcessor: string;
  repaymentMethod: string;
  repaymentProcessor: string;
  paymentCurrency: string;
  autoRepayEnabled: boolean;
  gracePeriodDays: string;
  lateFeeAmount: string;
  minMonthlyPayment: string;
  maxOutstandingAmount: string;
  interestRate: string;
  paymentDueDay: string;
  transactionLimit: string;
  paymentDetailsJson: string;
  planFrequency: string;
  planWeeklyDay: string;
  planBiweeklyDay: string;
  planBankId: string;
};

function emptyBillingForm(): BillingFormFields {
  return {
    paymentMethod: 'ACH',
    paymentProcessor: '',
    repaymentMethod: 'ACH',
    repaymentProcessor: '',
    paymentCurrency: 'USD',
    autoRepayEnabled: false,
    gracePeriodDays: '',
    lateFeeAmount: '',
    minMonthlyPayment: '',
    maxOutstandingAmount: '',
    interestRate: '',
    paymentDueDay: '',
    transactionLimit: '',
    paymentDetailsJson: '',
    planFrequency: '',
    planWeeklyDay: 'MONDAY',
    planBiweeklyDay: 'MONDAY',
    planBankId: '',
  };
}

function strField(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function billingFormFromRecords(
  payment: Record<string, unknown> | null,
  plan: Record<string, unknown> | null,
): BillingFormFields {
  if (!payment) return emptyBillingForm();
  let detailsText = '';
  if (payment.paymentDetails != null) {
    detailsText =
      typeof payment.paymentDetails === 'object'
        ? JSON.stringify(payment.paymentDetails as object, null, 2)
        : String(payment.paymentDetails);
  }
  const planDaysArr =
    plan && Array.isArray(plan.paymentDays)
      ? (plan.paymentDays as unknown[]).map((d) => String(d ?? '').trim()).filter(Boolean)
      : [];
  const planFreq = plan ? strField(plan.frequency) : '';
  let planWeeklyDay = 'MONDAY';
  let planBiweeklyDay = 'MONDAY';
  if (planFreq === 'WEEKLY') {
    planWeeklyDay = normalizeBusinessWeekday(planDaysArr[0], 'MONDAY');
  } else if (planFreq === 'BIWEEKLY') {
    planBiweeklyDay = normalizeBusinessWeekday(planDaysArr[0] ?? planDaysArr[1], 'MONDAY');
  }
  return {
    paymentMethod: strField(payment.paymentMethod) || 'ACH',
    paymentProcessor: strField(payment.paymentProcessor),
    repaymentMethod: strField(payment.repaymentMethod) || 'ACH',
    repaymentProcessor: strField(payment.repaymentProcessor),
    paymentCurrency: strField(payment.paymentCurrency) || 'USD',
    autoRepayEnabled: payment.autoRepayEnabled === true || payment.autoRepayEnabled === 'true',
    gracePeriodDays: strField(payment.gracePeriodDays),
    lateFeeAmount: strField(payment.lateFeeAmount),
    minMonthlyPayment: strField(payment.minMonthlyPayment),
    maxOutstandingAmount: strField(payment.maxOutstandingAmount),
    interestRate: strField(payment.interestRate),
    paymentDueDay: strField(payment.paymentDueDay),
    transactionLimit: strField(payment.transactionLimit),
    paymentDetailsJson: detailsText,
    planFrequency: planFreq,
    planWeeklyDay,
    planBiweeklyDay,
    planBankId: plan && plan.bankId != null && plan.bankId !== '' ? String(plan.bankId) : '',
  };
}

function buildPlanPaymentDaysForSave(form: BillingFormFields): string[] {
  const f = form.planFrequency.trim();
  if (!f) return [];
  if (f === 'DAILY') return [];
  if (f === 'WEEKLY') return [form.planWeeklyDay];
  if (f === 'BIWEEKLY') return [form.planBiweeklyDay];
  return [];
}

export default function SyndicatorAdminBillingPage() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [payment, setPayment] = useState<Record<string, unknown> | null>(null);
  const [billingForm, setBillingForm] = useState<BillingFormFields>(emptyBillingForm());
  const [addBankOpen, setAddBankOpen] = useState(false);
  const [newBankForm, setNewBankForm] = useState<NewBankFormState>(emptyNewBankForm());
  const [newBankSaving, setNewBankSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!syndicatorId) return;
    setLoading(true);
    try {
      const res = await axiosGet(`/syndicators/${syndicatorId}?extended=1`);
      const raw = res?.data?.data ?? {};
      const dataObj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
      setBanks(pickBankList(dataObj));
      const nextPay = pickSyndicatorPayment(dataObj);
      setPayment(nextPay);
      const planRaw = nextPay?.repaymentPlan;
      const planRec =
        planRaw && typeof planRaw === 'object' && !Array.isArray(planRaw)
          ? (planRaw as Record<string, unknown>)
          : null;
      setBillingForm(billingFormFromRecords(nextPay, planRec));
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Billing information could not be loaded.';
      toast.error(msg);
      setBanks([]);
      setPayment(null);
      setBillingForm(emptyBillingForm());
    } finally {
      setLoading(false);
    }
  }, [syndicatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitNewBank = async () => {
    if (!syndicatorId) return;
    const bankName = newBankForm.bankName.trim();
    const routingNumber = newBankForm.routingNumber.trim();
    const accountNumber = newBankForm.accountNumber.trim();
    if (!bankName || !routingNumber || !accountNumber) {
      toast.error('Bank name, routing number, and account number are required.');
      return;
    }
    setNewBankSaving(true);
    try {
      const res = await axiosPost(`/syndicators/${syndicatorId}/bank-accounts`, {
        bankName,
        routingNumber,
        accountNumber,
        branch: newBankForm.branch.trim() || undefined,
        nameOnVoidedCheck: newBankForm.nameOnVoidedCheck.trim() || undefined,
        accountType: newBankForm.accountType,
      });
      const payload = res?.data?.data as Record<string, unknown> | undefined;
      const rawId = payload?.id;
      const newId = typeof rawId === 'number' ? rawId : Number(rawId);
      toast.success('Bank account added');
      setAddBankOpen(false);
      setNewBankForm(emptyNewBankForm());
      await load();
      if (Number.isFinite(newId)) {
        setBillingForm((f) => ({ ...f, planBankId: String(newId) }));
      }
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not add bank account.';
      toast.error(msg);
    } finally {
      setNewBankSaving(false);
    }
  };

  const saveBilling = async () => {
    if (!syndicatorId) return;
    setSaving(true);
    try {
      let paymentDetails: unknown | undefined;
      const rawPd = billingForm.paymentDetailsJson.trim();
      if (rawPd !== '') {
        try {
          paymentDetails = JSON.parse(rawPd);
        } catch {
          toast.error('Payment details must be valid JSON');
          setSaving(false);
          return;
        }
      }

      const planDays = buildPlanPaymentDaysForSave(billingForm);
      if (
        billingForm.repaymentMethod === 'ACH' &&
        billingForm.planFrequency.trim() !== '' &&
        billingForm.planBankId.trim() === ''
      ) {
        toast.error('Linked bank account is required for ACH repayment schedules.');
        setSaving(false);
        return;
      }

      await axiosPut(`/syndicators/${syndicatorId}/payment-setting`, {
        paymentMethod: billingForm.paymentMethod,
        paymentProcessor:
          billingForm.paymentProcessor.trim() === '' ? null : billingForm.paymentProcessor,
        repaymentMethod: billingForm.repaymentMethod,
        repaymentProcessor:
          billingForm.repaymentProcessor.trim() === '' ? null : billingForm.repaymentProcessor,
        paymentCurrency: billingForm.paymentCurrency.trim() === '' ? null : billingForm.paymentCurrency,
        autoRepayEnabled: billingForm.autoRepayEnabled,
        gracePeriodDays:
          billingForm.gracePeriodDays.trim() === '' ? null : Number(billingForm.gracePeriodDays),
        lateFeeAmount: billingForm.lateFeeAmount.trim() === '' ? null : billingForm.lateFeeAmount,
        minMonthlyPayment:
          billingForm.minMonthlyPayment.trim() === '' ? null : billingForm.minMonthlyPayment,
        maxOutstandingAmount:
          billingForm.maxOutstandingAmount.trim() === '' ? null : billingForm.maxOutstandingAmount,
        interestRate:
          billingForm.interestRate.trim() === '' ? null : billingForm.interestRate,
        paymentDueDay:
          billingForm.paymentDueDay.trim() === '' ? null : Number(billingForm.paymentDueDay),
        transactionLimit:
          billingForm.transactionLimit.trim() === '' ? null : billingForm.transactionLimit,
        ...(rawPd !== '' ? { paymentDetails } : {}),
        repaymentPlan: {
          frequency: billingForm.planFrequency.trim() === '' ? null : billingForm.planFrequency,
          paymentDays: planDays.length ? planDays : [],
          repaymentMethod: billingForm.repaymentMethod,
          repaymentProcessor:
            billingForm.repaymentProcessor.trim() === '' ? null : billingForm.repaymentProcessor,
          bankId:
            billingForm.planBankId.trim() === '' ? null : Number(billingForm.planBankId),
        },
      });
      toast.success('Billing saved');
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not save billing.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading billing…
      </div>
    );
  }

  const disbursementProcessorRelevant = isAchTransmission(billingForm.paymentMethod);
  const repaymentProcessorRelevant = isAchTransmission(billingForm.repaymentMethod);
  const scheduleUsesWeekdays =
    billingForm.planFrequency === 'WEEKLY' || billingForm.planFrequency === 'BIWEEKLY';

  const setScheduleWeekday = (day: string) => {
    setBillingForm((f) => {
      if (f.planFrequency === 'WEEKLY') return { ...f, planWeeklyDay: day };
      if (f.planFrequency === 'BIWEEKLY') return { ...f, planBiweeklyDay: day };
      return f;
    });
  };

  const scheduleDaySelected =
    billingForm.planFrequency === 'WEEKLY'
      ? billingForm.planWeeklyDay
      : billingForm.planFrequency === 'BIWEEKLY'
        ? billingForm.planBiweeklyDay
        : '';

  return (
    <div className="grid gap-6">
      <Dialog
        open={addBankOpen}
        onOpenChange={(open: boolean) => {
          setAddBankOpen(open);
          if (!open) setNewBankForm(emptyNewBankForm());
        }}
      >
        <DialogContent className="max-w-md gap-4 py-6">
          <DialogHeader>
            <DialogTitle>Add bank account</DialogTitle>
            <DialogDescription>
              Link a bank to this syndicator for repayment ACH. Saving billing is still required after you
              pick this account if you change rails or schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nb-bankName">Bank name</Label>
              <Input
                id="nb-bankName"
                value={newBankForm.bankName}
                onChange={(e) => setNewBankForm((s) => ({ ...s, bankName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-routing">Routing number</Label>
              <Input
                id="nb-routing"
                inputMode="numeric"
                autoComplete="off"
                value={newBankForm.routingNumber}
                onChange={(e) => setNewBankForm((s) => ({ ...s, routingNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nb-account">Account number</Label>
              <Input
                id="nb-account"
                inputMode="numeric"
                autoComplete="off"
                value={newBankForm.accountNumber}
                onChange={(e) => setNewBankForm((s) => ({ ...s, accountNumber: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nb-branch">Branch (optional)</Label>
              <Input
                id="nb-branch"
                value={newBankForm.branch}
                onChange={(e) => setNewBankForm((s) => ({ ...s, branch: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nb-nameOnCheck">Name on voided check (optional)</Label>
              <Input
                id="nb-nameOnCheck"
                value={newBankForm.nameOnVoidedCheck}
                onChange={(e) => setNewBankForm((s) => ({ ...s, nameOnVoidedCheck: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="nb-accountType">Account type</Label>
              <select
                id="nb-accountType"
                className={inputSelectClass}
                value={newBankForm.accountType}
                onChange={(e) =>
                  setNewBankForm((s) => ({
                    ...s,
                    accountType: e.target.value as NewBankFormState['accountType'],
                  }))
                }
              >
                {SYNDICATOR_BANK_ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAddBankOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={newBankSaving}
              onClick={() => void submitNewBank()}
            >
              {newBankSaving ? 'Saving…' : 'Add account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="shadow-sm gap-0 py-0">
        <CardContent className="grid gap-6 py-6">
          {!payment ? (
            <p className="text-sm text-muted-foreground rounded-md border border-border border-dashed px-3 py-2 bg-muted/30">
              No billing profile is saved yet. Defaults apply —{' '}
              <span className="text-foreground font-medium">Submit</span> saves to the database (other billing
              fields stay as already stored).
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment transmission method</Label>
              <select
                id="paymentMethod"
                className={inputSelectClass}
                value={billingForm.paymentMethod}
                onChange={(e) => {
                  const v = e.target.value;
                  setBillingForm((f) => ({
                    ...f,
                    paymentMethod: v,
                    paymentProcessor: isAchTransmission(v) ? f.paymentProcessor : '',
                  }));
                }}
              >
                {!isStandardBillingTransmissionMethod(billingForm.paymentMethod) &&
                billingForm.paymentMethod ? (
                  <option value={billingForm.paymentMethod}>
                    {billingForm.paymentMethod.replace(/_/g, ' ')} (saved)
                  </option>
                ) : null}
                {BILLING_TRANSMISSION_METHOD_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o === 'CREDIT_CARD'
                      ? 'Credit card'
                      : o === 'WIRE_TRANSFER'
                        ? 'Wire'
                        : o.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="paymentProcessor"
                className={cn(!disbursementProcessorRelevant && 'text-muted-foreground')}
              >
                Payment transmission processor
              </Label>
              <select
                id="paymentProcessor"
                className={cn(inputSelectClass, processorSelectDisabledClass)}
                disabled={!disbursementProcessorRelevant}
                title={
                  disbursementProcessorRelevant ? undefined : 'Processor is available when ACH is selected.'
                }
                value={billingForm.paymentProcessor || ''}
                onChange={(e) =>
                  setBillingForm((f) => ({ ...f, paymentProcessor: e.target.value }))
                }
              >
                <option value="">None</option>
                {PROCESSOR_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="repaymentMethod">Repayment transmission method</Label>
              <select
                id="repaymentMethod"
                className={inputSelectClass}
                value={billingForm.repaymentMethod}
                onChange={(e) => {
                  const v = e.target.value;
                  setBillingForm((f) => ({
                    ...f,
                    repaymentMethod: v,
                    repaymentProcessor: isAchTransmission(v) ? f.repaymentProcessor : '',
                  }));
                }}
              >
                {!isStandardBillingTransmissionMethod(billingForm.repaymentMethod) &&
                billingForm.repaymentMethod ? (
                  <option value={billingForm.repaymentMethod}>
                    {billingForm.repaymentMethod.replace(/_/g, ' ')} (saved)
                  </option>
                ) : null}
                {BILLING_TRANSMISSION_METHOD_OPTIONS.map((o) => (
                  <option key={`r-${o}`} value={o}>
                    {formatBillingTransmissionOptionLabel(o)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="repaymentProcessor"
                className={cn(!repaymentProcessorRelevant && 'text-muted-foreground')}
              >
                Repayment transmission processor
              </Label>
              <select
                id="repaymentProcessor"
                className={cn(inputSelectClass, processorSelectDisabledClass)}
                disabled={!repaymentProcessorRelevant}
                title={
                  repaymentProcessorRelevant ? undefined : 'Processor is available when ACH is selected.'
                }
                value={billingForm.repaymentProcessor || ''}
                onChange={(e) =>
                  setBillingForm((f) => ({ ...f, repaymentProcessor: e.target.value }))
                }
              >
                <option value="">None</option>
                {PROCESSOR_OPTIONS.map((o) => (
                  <option key={`rp-${o}`} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-base font-semibold text-foreground">Repayment Plan</h3>
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="planFrequency">Payment Frequency</Label>
                <select
                  id="planFrequency"
                  className={inputSelectClass}
                  value={billingForm.planFrequency || ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBillingForm((f) => {
                      const next: BillingFormFields = { ...f, planFrequency: v };
                      if (!v) return next;
                      if (v === 'WEEKLY') {
                        if (f.planFrequency === 'BIWEEKLY') {
                          next.planWeeklyDay = f.planBiweeklyDay || 'MONDAY';
                        } else if (f.planFrequency !== 'WEEKLY') {
                          next.planWeeklyDay = 'MONDAY';
                        }
                      }
                      if (v === 'BIWEEKLY') {
                        if (f.planFrequency === 'WEEKLY') {
                          next.planBiweeklyDay = f.planWeeklyDay || 'MONDAY';
                        } else if (f.planFrequency !== 'BIWEEKLY') {
                          next.planBiweeklyDay = 'MONDAY';
                        }
                      }
                      return next;
                    });
                  }}
                >
                  <option value="">Not set</option>
                  {PAYMENT_FREQUENCY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Payment Day</Label>
                {scheduleUsesWeekdays ? (
                  <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                    {BUSINESS_WEEKDAYS.map((d) => (
                      <label
                        key={d}
                        className="flex cursor-pointer items-center gap-2 text-sm hover:text-foreground"
                      >
                        <input
                          type="radio"
                          name="scheduleWeekday"
                          className="text-primary"
                          checked={scheduleDaySelected === d}
                          onChange={() => setScheduleWeekday(d)}
                        />
                        <span>{formatWeekdayLabel(d).toUpperCase()}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    Choose weekly or bi-weekly frequency to pick a weekday.
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2 max-w-xl">
              <Label htmlFor="planBankId">Bank</Label>
              <select
                id="planBankId"
                className={inputSelectClass}
                value={billingForm.planBankId || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === ADD_BANK_SELECT_VALUE) {
                    setAddBankOpen(true);
                    return;
                  }
                  setBillingForm((f) => ({ ...f, planBankId: v }));
                }}
              >
                <option value="">None</option>
                {banks.map((b) => (
                  <option key={b.id ?? b.accountNumber} value={b.id != null ? String(b.id) : ''}>
                    {formatBankDropdownLabel(b)}
                  </option>
                ))}
                <option value={ADD_BANK_SELECT_VALUE}>+ Add bank account…</option>
              </select>
              {banks.length === 0 ? (
                <p className="text-xs text-muted-foreground">No bank accounts linked to this syndicator.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Required when repayment transmission is ACH and a schedule frequency is set.
                </p>
              )}
            </div>
          </div>
        </CardContent>
        <CardFooter className="border-t py-4 flex justify-end">
          <Button
            type="button"
            className="bg-emerald-600 hover:bg-emerald-600/90 text-white"
            disabled={saving || !syndicatorId}
            onClick={() => void saveBilling()}
          >
            {saving ? 'Saving…' : 'Submit'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
