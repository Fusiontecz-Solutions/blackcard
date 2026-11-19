import { useEffect, useMemo } from 'react';
import { useForm, type SubmitHandler } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import { Building2, FileSignature, User } from 'lucide-react';

import type { RootState, AppDispatch } from '@/redux/store';
import { updateUser } from '@/redux/actions/settingsUserActions';
import type { user as UserType } from '@/redux/slices/authSlice';
import { TextField, EmailField, PhoneField } from '@/components/inputFields/InputFields';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { isSuperAdminRole, resolveEffectiveRole } from '@/lib/sessionRole';
import DocuSignAccountsSettings from '@/pages/settings/DocuSignAccountsSettings';
import FundersSettings from '@/pages/settings/FundersSettings';

interface FormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

const schema = yup.object().shape({
  firstName: yup.string().trim().required('First name is required'),
  lastName: yup.string().trim().required('Last name is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  phone: yup.string().trim().optional(),
});

type SettingsTab = 'profile' | 'docusign' | 'funders';

export default function UserSetting() {
  const dispatch = useDispatch<AppDispatch>();
  const loginData = useSelector((state: RootState) => state.login?.data);
  const [searchParams, setSearchParams] = useSearchParams();
  const isFieldsDisabled = true;

  const isSuperAdmin = isSuperAdminRole(resolveEffectiveRole(loginData?.user));

  const tabParam = String(searchParams.get('tab') || 'profile').toLowerCase();
  const activeTab: SettingsTab =
    isSuperAdmin && (tabParam === 'docusign' || tabParam === 'funders') ? tabParam : 'profile';

  const user: UserType | undefined = useMemo(() => {
    if (loginData?.user) return loginData.user;
    try {
      const stored = localStorage.getItem('user');
      return stored ? (JSON.parse(stored) as UserType) : undefined;
    } catch {
      return undefined;
    }
  }, [loginData]);

  const initials = useMemo(() => {
    const first = user?.firstName?.trim()?.[0] ?? '';
    const last = user?.lastName?.trim()?.[0] ?? '';
    const combined = `${first}${last}`.toUpperCase();
    return combined || (user?.email?.[0]?.toUpperCase() ?? 'U');
  }, [user]);

  const {
    control,
    handleSubmit,
    reset,
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
    },
  });

  useEffect(() => {
    if (!user) return;
    reset({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      email: user.email ?? '',
      phone: user.phone ?? '',
    });
  }, [user, reset]);

  const onSubmit: SubmitHandler<FormValues> = async (values) => {
    if (!user?._id) {
      toast.error('Unable to update profile. User not found.');
      return;
    }

    try {
      const payload = {
        id: user._id,
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        phone: values.phone?.trim() || undefined,
      };

      const res: any = await dispatch(updateUser(payload)).unwrap();

      const updatedUser: UserType = {
        ...user,
        ...payload,
      };

      localStorage.setItem('user', JSON.stringify(updatedUser));
      toast.success(res?.message ?? 'Account settings updated successfully');
      reset(values);
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to update account settings');
    }
  };

  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'profile') next.delete('tab');
    else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const pageTitle =
    activeTab === 'docusign'
      ? 'DocuSign Accounts'
      : activeTab === 'funders'
        ? 'Funders'
        : 'Settings';

  const pageDescription =
    activeTab === 'profile'
      ? 'Manage your profile information and keep your contact details up to date.'
      : activeTab === 'docusign'
        ? 'Configure DocuSign JWT accounts used when sending contracts.'
        : 'Configure funders, contract layouts, and linked DocuSign accounts.';

  const profilePanel = (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="md:self-start">
        <Card className="border-border">
          <CardContent className="pt-6 flex flex-col items-center md:items-center gap-4">
            <div className="relative flex items-center justify-center">
              <div className="h-24 w-24 rounded-full flex items-center justify-center border border-border/70 shadow-sm text-3xl font-semibold text-white bg-[image:var(--brand-gradient)]">
                {initials}
              </div>
            </div>

            <div className="text-center md:text-center space-y-1 mt-4">
              <h3 className="text-base font-semibold leading-tight">
                {user?.firstName} {user?.lastName}
              </h3>
              <p className="text-xs text-muted-foreground break-all">{user?.email}</p>
            </div>
          </CardContent>
        </Card>
      </aside>

      <Card className="border-border md:col-span-1">
        <CardHeader className="border-b bg-muted/40 backdrop-blur-sm">
          <CardTitle className="text-lg">Personal information</CardTitle>
          <CardDescription>
            These details are used across your In‑House CRM workspace.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <CardContent className="space-y-6 pt-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                name="firstName"
                label="First Name"
                required
                disabled={isFieldsDisabled}
                control={control}
              />
              <TextField
                name="lastName"
                label="Last Name"
                required
                disabled={isFieldsDisabled}
                control={control}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <EmailField
                name="email"
                label="Email Address"
                required
                disabled={isFieldsDisabled}
                control={control}
              />
              <PhoneField
                name="phone"
                label="Phone Number"
                disabled={isFieldsDisabled}
                control={control}
              />
            </div>
          </CardContent>
        </form>
      </Card>
    </div>
  );

  return (
    <div className="min-h-[calc(100vh-80px)] w-full bg-background">
      <div className="container w-full px-4 py-10">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-foreground">{pageTitle}</h1>
                <p className="text-sm text-muted-foreground mt-1">{pageDescription}</p>
              </div>
            </div>
          </div>

          <Separator />

          {isSuperAdmin ? (
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <TabsList className="inline-flex h-auto flex-wrap gap-0 rounded-lg bg-[#E8ECF1] dark:bg-muted p-1 border-0 shadow-none mb-4">
                <TabsTrigger
                  value="profile"
                  className={cn(
                    'gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    'data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#687182]',
                    'data-[state=active]:bg-[image:var(--brand-gradient)] data-[state=active]:text-white data-[state=active]:shadow-sm',
                  )}
                >
                  <User className="h-4 w-4 shrink-0" />
                  Profile
                </TabsTrigger>
                <TabsTrigger
                  value="docusign"
                  className={cn(
                    'gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    'data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#687182]',
                    'data-[state=active]:bg-[image:var(--brand-gradient)] data-[state=active]:text-white data-[state=active]:shadow-sm',
                  )}
                >
                  <FileSignature className="h-4 w-4 shrink-0" />
                  DocuSign
                </TabsTrigger>
                <TabsTrigger
                  value="funders"
                  className={cn(
                    'gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    'data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#687182]',
                    'data-[state=active]:bg-[image:var(--brand-gradient)] data-[state=active]:text-white data-[state=active]:shadow-sm',
                  )}
                >
                  <Building2 className="h-4 w-4 shrink-0" />
                  Funders
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="mt-0 outline-none">
                {profilePanel}
              </TabsContent>
              <TabsContent value="docusign" className="mt-0 outline-none">
                <DocuSignAccountsSettings />
              </TabsContent>
              <TabsContent value="funders" className="mt-0 outline-none">
                <FundersSettings />
              </TabsContent>
            </Tabs>
          ) : (
            profilePanel
          )}
        </div>
      </div>
    </div>
  );
}
