import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { shallowEqual } from 'react-redux';
import { useSearchParams, Navigate } from 'react-router';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { User, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchRoles } from '@/redux/actions/roleActions';
import { fetchUsersByRole } from '@/redux/actions/settingsUserActions';
import { selectRolesList, selectRolesLoading } from '@/redux/selectors/rolesSelectors';
import { selectUsersByRole, selectUsersLoadingByRole } from '@/redux/selectors/settingsUsersSelectors';
import type { AppDispatch, RootState } from '@/redux/store';
import { isSuperAdminRole, resolveEffectiveRole } from '@/lib/sessionRole';
import Agent from './Agent';
import UNDERWRITER from './UNDERWRITER';
import SCRUBBING from './SCRUBBING';
import Syndicators from './Syndicators';
import Accounts from './Accounts';
import Operations from './Operations';
import AddUserModal from './AddUserModal';

const FALLBACK_ROLES = [
  { id: "AGENT", roleName: "Agent", name: "Agent" },
  { id: "SCRUBBING", roleName: "Scrubbing", name: "Scrubbing" },
  {
    id: "UNDERWRITER",
    roleName: "Underwriters",
    name: "Underwriters",
  },
  { id: "OPERATIONS", roleName: "Operations", name: "Operations" },
  { id: "SYNDICATORS", roleName: "Syndicators", name: "Syndicators" },
  { id: "ACCOUNTS", roleName: "Accounts", name: "Accounts" },
];

const ROLE_ID_TO_COMPONENT: Record<string, React.ComponentType<{ users: any[]; loading: boolean; error: string | null }>> = {
  AGENT: Agent,
  SCRUBBING: SCRUBBING,
  UNDERWRITER: UNDERWRITER,
  OPERATIONS: Operations,
  SYNDICATORS: Syndicators,
  SYNDICATOR: Syndicators,
  ACCOUNTS: Accounts,
  ACCOUNTANT: Agent,
  ADMIN: Agent,
  SUPER_ADMIN: Agent,
};

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const dispatch = useDispatch<AppDispatch>();
  const loginData = useSelector((s: RootState) => s.login?.data);
  const rolesFromStore = useSelector(selectRolesList, shallowEqual);
  const rolesLoading = useSelector(selectRolesLoading);
  const roles = rolesFromStore.length > 0 ? rolesFromStore : FALLBACK_ROLES;

  const isSuperAdmin = isSuperAdminRole(resolveEffectiveRole(loginData?.user));

  const [activeTab, setActiveTab] = useState<string>('');
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    dispatch(fetchRoles());
  }, [dispatch]);

  useEffect(() => {
    if (!roles.length) return;
    const tabFromQuery = String(searchParams.get('tab') || '')
      .trim()
      .toUpperCase();
    const preferredTab =
      tabFromQuery === 'SYNDICATORS' ? 'SYNDICATORS' : '';

    if (preferredTab && roles.some((r) => r.id === preferredTab)) {
      if (activeTab !== preferredTab) setActiveTab(preferredTab);
      return;
    }
    if (!activeTab) setActiveTab(roles[0].id);
  }, [roles, activeTab, searchParams]);

  useEffect(() => {
    if (activeTab) dispatch(fetchUsersByRole(activeTab));
  }, [dispatch, activeTab]);

  const users = useSelector((state: RootState) => selectUsersByRole(state, activeTab), shallowEqual);
  const usersLoading = useSelector((state: RootState) => selectUsersLoadingByRole(state, activeTab));

  const activeRole = roles.find((r) => r.id === activeTab);
  const activeLabel = activeRole?.roleName ?? activeRole?.name ?? activeTab ?? '';
  const addButtonLabel = activeLabel ? `Add ${activeLabel.replace(/s$/, '')}` : 'Add';

  const TabContentComponent = activeTab ? (ROLE_ID_TO_COMPONENT[activeTab] ?? Agent) : Agent;

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const next = new URLSearchParams(searchParams);
    if (value === 'SYNDICATORS') next.set('tab', 'SYNDICATORS');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };

  if (!isSuperAdmin) {
    return <Navigate to="/user-setting" replace />;
  }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-background p-4 md:p-6 lg:p-8">
      <div className="w-full mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
            Invite Members
          </h1>
          <Button
            className="gap-2 bg-[image:var(--brand-gradient)] hover:opacity-90 shrink-0 cursor-pointer"
            onClick={() => setAddModalOpen(true)}
          >
            <UserPlus className="h-4 w-4" />
            {addButtonLabel}
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full ">
          <TabsList className="w-full inline-flex h-auto flex-wrap  gap-0 rounded-lg bg-[#E8ECF1] dark:bg-muted p-1 border-0 shadow-none ">
            {rolesLoading && roles.length === 0 ? (
              <span className="px-4 py-2 text-sm text-muted-foreground">Loading tabs...</span>
            ) : (
              FALLBACK_ROLES.map((role) => (
                <TabsTrigger
                  key={role.id}
                  value={role.id}
                  className={cn(
                    'gap-1.5 rounded-md px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:cursor-not-allowed',
                    'data-[state=inactive]:bg-transparent data-[state=inactive]:text-[#687182] data-[state=inactive]:hover:text-foreground',
                    'data-[state=active]:bg-[image:var(--brand-gradient)] data-[state=active]:text-white data-[state=active]:shadow-sm'
                  )}
                >
                  <User className="h-4 w-4 shrink-0" aria-hidden />
                  <span>{role.roleName ?? role.name ?? role.id}</span>
                </TabsTrigger>
              ))
            )}
          </TabsList>

          <div className="mt-4">
            {activeTab && (
              <TabsContent value={activeTab} className="mt-0 outline-none">
                <TabContentComponent
                  users={users}
                  loading={usersLoading}
                  error={null}
                />
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>

      <AddUserModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        role={activeTab}
        roleName={activeLabel}
        createSyndicatorProfile={activeTab === 'SYNDICATORS' || activeTab === 'SYNDICATOR'}
      />
    </div>
  );
}
