import { useEffect } from 'react';
import { useForm, Controller, type SubmitHandler } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useDispatch } from 'react-redux';
import { toast } from 'react-toastify';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createUser } from '@/redux/actions/settingsUserActions';
import type { AppDispatch } from '@/redux/store';
import { axiosGet, axiosPost, axiosPut } from '@/redux/axios';
import { formatUSPhoneNumber, handleUSPhoneInputChange } from '@/utils/formatPhoneNumber';

interface FormValues {
  name: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  status: 'active' | 'inactive';
  companyName?: string;
  feePercentage?: string;
  openingBalance?: string;
}

const schema = yup.object().shape({
  name: yup.string().trim().required('First name is required'),
  lastName: yup.string().trim().required('Last name is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  phone: yup.string().trim().optional(),
  password: yup
    .string()
    .required('Password is required')
    .min(8, 'Password must be at least 8 characters')
    .matches(/[A-Z]/, 'Password must include an uppercase letter')
    .matches(/[a-z]/, 'Password must include a lowercase letter')
    .matches(/[0-9]/, 'Password must include a number')
    .matches(/[^A-Za-z0-9]/, 'Password must include a special character'),
  status: yup.string().oneOf(['active', 'inactive']).default('active'),
  companyName: yup.string().trim().optional(),
  feePercentage: yup
    .string()
    .optional()
    .test('fee-range', 'Fee must be between 0 and 100', (v) => {
      if (v == null || v.trim() === '') return true;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= 100;
    }),
  openingBalance: yup
    .string()
    .optional()
    .test('bal-positive', 'Opening balance cannot be negative', (v) => {
      if (v == null || v.trim() === '') return true;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0;
    }),
});

/** Resolve the syndicator profile id for a freshly-created account by email. */
async function resolveSyndicatorIdByEmail(email: string): Promise<number | null> {
  try {
    const res = await axiosGet('/syndicators');
    const arr: Array<{ id: number; email?: string | null }> = res?.data?.data ?? [];
    const match = arr
      .filter((s) => (s.email ?? '').toLowerCase() === email.toLowerCase())
      .sort((a, b) => b.id - a.id)[0];
    return match?.id ?? null;
  } catch {
    return null;
  }
}

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  /** Role id (e.g. AGENT, SCRUBBING). Used for API and Redux byRole. */
  role: string;
  /** Display name for the role (e.g. "Agent", "Scrubbing"). */
  roleName?: string;
  onSuccess?: () => void;
  /** When true, request includes `createSyndicatorProfile: true` on create-user (optional; syndicator profiles are created by default). */
  createSyndicatorProfile?: boolean;
}

export default function AddUserModal({
  open,
  onClose,
  role,
  roleName,
  onSuccess,
  createSyndicatorProfile,
}: AddUserModalProps) {
  const dispatch = useDispatch<AppDispatch>();

  const {
    control,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      name: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      status: 'active',
      companyName: '',
      feePercentage: '',
      openingBalance: '',
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      name: '',
      lastName: '',
      email: '',
      phone: '',
      password: '',
      status: 'active',
      companyName: '',
      feePercentage: '',
      openingBalance: '',
    });
  }, [open, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (data) => {
    try {
      const fullName = `${data.name} ${data.lastName}`.trim();
      const email = data.email.trim().toLowerCase();
      await dispatch(
        createUser({
          name: fullName,
          email,
          phone: data.phone?.trim() || undefined,
          password: data.password,
          role,
          status: data.status === 'active',
          ...(createSyndicatorProfile ? { createSyndicatorProfile: true } : {}),
        })
      ).unwrap();

      // For syndicators, follow up with profile (company), fee % and an opening
      // wallet credit — best-effort so the core account still succeeds if any fail.
      if (createSyndicatorProfile) {
        const company = data.companyName?.trim();
        const fee = data.feePercentage?.trim();
        const opening = Number(data.openingBalance ?? '');
        if (company || fee || (Number.isFinite(opening) && opening > 0)) {
          const sid = await resolveSyndicatorIdByEmail(email);
          if (sid) {
            try {
              if (company) await axiosPut(`/syndicators/${sid}`, { companyName: company });
              if (fee) await axiosPut(`/syndicators/${sid}/syndicator-setting`, { feePercentage: fee });
              if (Number.isFinite(opening) && opening > 0) {
                await axiosPost(`/syndicators/${sid}/wallet-balance`, {
                  amount: opening,
                  paymentType: 'CREDIT',
                  description: 'Opening balance',
                });
              }
            } catch {
              toast.warn('Account created, but some setup (fee/wallet) could not be saved. Edit it from the profile.');
            }
          }
        }
      }

      toast.success(
        createSyndicatorProfile
          ? 'Syndicator account and profile created'
          : 'User created successfully',
      );
      onClose();
      onSuccess?.();
    } catch (err: any) {
      const message =
        typeof err === 'string' ? err : err?.message ?? 'Failed to create user';
      toast.error(message);
    }
  };

  const label = roleName ?? role;

  return (
    <Dialog open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {label}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">First Name</Label>
            <Controller
              name="name"
              control={control}
              render={({ field }) => (
                <Input
                  id="name"
                  placeholder="Enter first name"
                  autoComplete="name"
                  disabled={isSubmitting}
                  {...field}
                />
              )}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Controller
              name="lastName"
              control={control}
              render={({ field }) => (
                <Input
                  id="lastName"
                  placeholder="Enter last name"
                  autoComplete="family-name"
                  disabled={isSubmitting}
                  {...field}
                />
              )}
            />
            {errors.lastName && (
              <p className="text-sm text-destructive">{errors.lastName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter email"
                  autoComplete="email"
                  disabled={isSubmitting}
                  {...field}
                />
              )}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <Input
                  id="phone"
                  type="tel"
                  placeholder="(XXX) XXX-XXXX"
                  autoComplete="tel"
                  disabled={isSubmitting}
                  {...field}
                  value={formatUSPhoneNumber(field.value)}
                  onChange={(e) => handleUSPhoneInputChange(e, field.onChange)}
                  inputMode="numeric"
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 chars, upper, lower, number, symbol"
                  autoComplete="new-password"
                  disabled={isSubmitting}
                  {...field}
                />
              )}
            />
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          {createSyndicatorProfile ? (
            <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Syndicator setup
              </p>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company</Label>
                <Controller
                  name="companyName"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="companyName"
                      placeholder="Company name"
                      autoComplete="organization"
                      disabled={isSubmitting}
                      {...field}
                    />
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="feePercentage">Management fee (%)</Label>
                  <Controller
                    name="feePercentage"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="feePercentage"
                        type="number"
                        step="0.01"
                        min={0}
                        max={100}
                        placeholder="0"
                        disabled={isSubmitting}
                        {...field}
                      />
                    )}
                  />
                  {errors.feePercentage && (
                    <p className="text-sm text-destructive">{errors.feePercentage.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="openingBalance">Opening wallet ($)</Label>
                  <Controller
                    name="openingBalance"
                    control={control}
                    render={({ field }) => (
                      <Input
                        id="openingBalance"
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0.00"
                        disabled={isSubmitting}
                        {...field}
                      />
                    )}
                  />
                  {errors.openingBalance && (
                    <p className="text-sm text-destructive">{errors.openingBalance.message}</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* <div className="space-y-2">
            <Label>Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div> */}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
