import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { axiosGet, axiosPut } from '@/redux/axios';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'react-toastify';
import { formatDate as formatDateUtil } from '@/lib/utils';
import { formatUSPhoneNumber, handleUSPhoneInputChange } from '@/utils/formatPhoneNumber';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  CalendarDays,
  ShieldCheck,
  Landmark,
  Percent,
  Pencil,
  Settings as SettingsIcon,
} from 'lucide-react';

type BankInfo = {
  id: number;
  bankName: string;
  routingNumber: string;
  accountNumber: string;
  accountType?: string | null;
  branch?: string | null;
};

type SyndicatorSetting = {
  feePercentage?: unknown;
  calculationLogic?: string | null;
  frequency?: string | null;
  automaticACH?: boolean | null;
  notificationRecipients?: string[] | null;
};

type ProfileData = {
  id: number;
  firstName: string;
  lastName?: string | null;
  email: string;
  phone?: string | null;
  companyName?: string | null;
  role?: string | null;
  status?: string | null;
  currentBalance?: unknown;
  createdAt?: string;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  website?: string | null;
  linkedinProfile?: string | null;
  notes?: string | null;
  SyndicatorBankInformation?: BankInfo[] | null;
  SyndicatorSetting?: SyndicatorSetting | null;
};

const money = (v: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v ?? 0) || 0);

/** Imported placeholder emails look like IMPORT-X@SYNDICATORS.INVALID — hide them. */
const isRealEmail = (email?: string | null) =>
  !!email && !/@syndicators\.invalid$/i.test(email) && !/^import-/i.test(email);

const maskAccount = (acct?: string | null) => {
  if (!acct) return '—';
  const s = String(acct);
  if (s.length <= 4) return `••${s}`;
  return `••••${s.slice(-4)}`;
};

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="text-sm font-medium text-foreground break-words">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const s = String(status ?? '').toUpperCase();
  const tone =
    s === 'ACTIVE'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : s === 'SUSPENDED'
        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {status ?? '—'}
    </span>
  );
}

export default function SyndicatorAdminProfilePage() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
  });

  const load = useCallback(async () => {
    if (!syndicatorId) return;
    setLoading(true);
    try {
      const res = await axiosGet(`/syndicators/${syndicatorId}?extended=1`);
      setData((res?.data?.data as ProfileData) ?? null);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not load profile';
      toast.error(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [syndicatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = () => {
    if (!data) return;
    setForm({
      firstName: data.firstName ?? '',
      lastName: data.lastName ?? '',
      companyName: data.companyName ?? '',
      email: isRealEmail(data.email) ? data.email : '',
      phone: data.phone ?? '',
      address1: data.address1 ?? '',
      address2: data.address2 ?? '',
      city: data.city ?? '',
      state: data.state ?? '',
      zip: data.zip ?? '',
    });
    setEditOpen(true);
  };

  const saveProfile = async () => {
    if (!syndicatorId) return;
    const fn = form.firstName.trim();
    const em = form.email.trim().toLowerCase();
    if (!fn) {
      toast.error('First name is required');
      return;
    }
    setSaving(true);
    try {
      await axiosPut(`/syndicators/${syndicatorId}`, {
        firstName: fn,
        lastName: form.lastName.trim() || undefined,
        companyName: form.companyName.trim() || undefined,
        email: em || undefined,
        phone: form.phone.trim() || undefined,
        address1: form.address1.trim() || undefined,
        address2: form.address2.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        zip: form.zip.trim() || undefined,
      });
      toast.success('Profile updated');
      setEditOpen(false);
      void load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not update profile';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const addressLine = useMemo(() => {
    if (!data) return '—';
    const parts = [data.address1, data.address2].filter(Boolean).join(', ');
    const cityLine = [data.city, data.state, data.zip].filter(Boolean).join(' ');
    const full = [parts, cityLine].filter(Boolean).join(' · ');
    return full || '—';
  }, [data]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading profile…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Profile not available.
      </div>
    );
  }

  const banks = Array.isArray(data.SyndicatorBankInformation) ? data.SyndicatorBankInformation : [];
  const setting = data.SyndicatorSetting ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Identity */}
      <Card className="shadow-sm gap-0 py-0 lg:col-span-2">
        <CardHeader className="border-b py-4 flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Profile</CardTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={openEdit}>
              <Pencil className="size-3.5" />
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 py-6 sm:grid-cols-2">
          <Field
            icon={Building2}
            label="Company"
            value={data.companyName || <span className="text-muted-foreground">—</span>}
          />
          <Field icon={ShieldCheck} label="Role" value={(data.role ?? '—').replace(/_/g, ' ')} />
          <Field
            icon={Mail}
            label="Email"
            value={
              isRealEmail(data.email) ? (
                <a href={`mailto:${data.email}`} className="text-primary hover:underline">
                  {data.email}
                </a>
              ) : (
                <span className="text-muted-foreground italic">No email on file</span>
              )
            }
          />
          <Field
            icon={Phone}
            label="Phone"
            value={data.phone || <span className="text-muted-foreground">—</span>}
          />
          <Field icon={MapPin} label="Address" value={addressLine} />
          <Field icon={CalendarDays} label="Member since" value={formatDateUtil(data.createdAt ?? '', '—')} />
          {data.notes ? (
            <div className="sm:col-span-2">
              <Field icon={SettingsIcon} label="Notes" value={data.notes} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Wallet balance + quick fee profile */}
      <div className="grid gap-6">
        <Card className="shadow-sm gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle className="text-base font-semibold">Wallet</CardTitle>
          </CardHeader>
          <CardContent className="py-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current balance</p>
            <p className="text-3xl font-bold tabular-nums">{money(data.currentBalance)}</p>
            <Link
              to={`/syndicators/syndicators-list/${syndicatorId}/transactions`}
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              View wallet transactions →
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-sm gap-0 py-0">
          <CardHeader className="border-b py-4 flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Fee profile</CardTitle>
            <Link
              to={`/syndicators/syndicators-list/${syndicatorId}/settings`}
              className="text-xs text-primary hover:underline"
            >
              Edit
            </Link>
          </CardHeader>
          <CardContent className="grid gap-4 py-6">
            {setting ? (
              <>
                <Field
                  icon={Percent}
                  label="Management fee"
                  value={`${Number(setting.feePercentage ?? 0) || 0}%`}
                />
                <Field
                  icon={SettingsIcon}
                  label="Frequency"
                  value={(setting.frequency ?? 'DAILY').replace(/_/g, ' ')}
                />
                <Field
                  icon={ShieldCheck}
                  label="Automatic ACH"
                  value={setting.automaticACH ? 'Enabled' : 'Disabled'}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No fee profile saved.{' '}
                <Link
                  to={`/syndicators/syndicators-list/${syndicatorId}/settings`}
                  className="text-primary hover:underline"
                >
                  Set it up
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bank information */}
      <Card className="shadow-sm gap-0 py-0 lg:col-span-3">
        <CardHeader className="border-b py-4">
          <CardTitle className="text-base font-semibold">Bank information</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          {banks.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {banks.map((b) => (
                <div key={b.id} className="rounded-lg border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <Landmark className="size-4 text-muted-foreground" />
                    <p className="font-medium text-foreground">{b.bankName}</p>
                  </div>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Account</dt>
                      <dd className="tabular-nums">{maskAccount(b.accountNumber)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Routing</dt>
                      <dd className="tabular-nums">{maskAccount(b.routingNumber)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Type</dt>
                      <dd>{(b.accountType ?? '—').toString().replace(/_/g, ' ')}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No bank accounts on file.</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={(o: boolean) => !saving && setEditOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-first">First name</Label>
              <Input
                id="p-first"
                value={form.firstName}
                onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                disabled={saving}
                autoComplete="given-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-last">Last name</Label>
              <Input
                id="p-last"
                value={form.lastName}
                onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                disabled={saving}
                autoComplete="family-name"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-company">Company</Label>
              <Input
                id="p-company"
                value={form.companyName}
                onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                disabled={saving}
                autoComplete="organization"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-email">Email</Label>
              <Input
                id="p-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                disabled={saving}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-phone">Phone</Label>
              <Input
                id="p-phone"
                type="tel"
                placeholder="(XXX) XXX-XXXX"
                value={formatUSPhoneNumber(form.phone)}
                onChange={(e) => handleUSPhoneInputChange(e, (v) => setForm((f) => ({ ...f, phone: v })))}
                disabled={saving}
                inputMode="numeric"
                autoComplete="tel"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-addr1">Address line 1</Label>
              <Input
                id="p-addr1"
                value={form.address1}
                onChange={(e) => setForm((f) => ({ ...f, address1: e.target.value }))}
                disabled={saving}
                autoComplete="address-line1"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="p-addr2">Address line 2</Label>
              <Input
                id="p-addr2"
                value={form.address2}
                onChange={(e) => setForm((f) => ({ ...f, address2: e.target.value }))}
                disabled={saving}
                autoComplete="address-line2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-city">City</Label>
              <Input
                id="p-city"
                value={form.city}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                disabled={saving}
                autoComplete="address-level2"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="p-state">State</Label>
                <Input
                  id="p-state"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  disabled={saving}
                  autoComplete="address-level1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="p-zip">ZIP</Label>
                <Input
                  id="p-zip"
                  value={form.zip}
                  onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                  disabled={saving}
                  autoComplete="postal-code"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveProfile()} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
