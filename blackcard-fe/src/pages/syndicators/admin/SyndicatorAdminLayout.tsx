import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router';
import { axiosGet } from '@/redux/axios';
import SyndicatorsSectionTabs from '@/components/syndicators/SyndicatorsSectionTabs';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CircleFadingPlus } from 'lucide-react';
import AddSyndicatorWalletBalanceDialog from './AddSyndicatorWalletBalanceDialog';
import type { SyndicatorAdminOutletContext } from './syndicatorAdminOutletContext';

/** Primary sections requested for the syndicator detail view. */
const ADMIN_TABS: { label: string; path: string; end?: boolean }[] = [
  { label: 'Profile', path: 'profile' },
  { label: 'Deals', path: 'syndications', end: true },
  { label: 'Wallet', path: 'transactions' },
];

/** Secondary admin tools — kept reachable but out of the main section bar. */
const ADMIN_TOOLS: { label: string; path: string }[] = [
  { label: 'Settings', path: 'settings' },
  { label: 'Billing', path: 'billing' },
  { label: 'Withdrawals', path: 'withdrawals' },
];

export default function SyndicatorAdminLayout() {
  const { syndicatorId } = useParams<{ syndicatorId: string }>();
  const [syndicator, setSyndicator] = useState<{
    firstName: string;
    lastName?: string | null;
    companyName?: string | null;
    currentBalance?: unknown;
    email?: string;
  } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addBalanceOpen, setAddBalanceOpen] = useState(false);
  const [walletRefreshToken, setWalletRefreshToken] = useState(0);

  const loadSyndicator = useCallback(async () => {
    if (!syndicatorId) return;
    try {
      const res = await axiosGet(`/syndicators/${syndicatorId}`);
      const data = res?.data?.data;
      setSyndicator(data ?? null);
      setLoadError(null);
    } catch (e: unknown) {
      setSyndicator(null);
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Unable to load syndicator';
      setLoadError(msg);
    }
  }, [syndicatorId]);

  const bumpWalletRefresh = useCallback(() => {
    void loadSyndicator();
    setWalletRefreshToken((t) => t + 1);
  }, [loadSyndicator]);

  useEffect(() => {
    void loadSyndicator();
  }, [loadSyndicator]);

  const title = useMemo(() => {
    if (!syndicator) return 'Syndicator';
    const parts = [syndicator.firstName, syndicator.lastName].filter(Boolean);
    const name = parts.join(' ');
    return name || syndicator.companyName || syndicator.email || 'Syndicator';
  }, [syndicator]);

  const balance = useMemo(() => {
    const n = Number(syndicator?.currentBalance ?? 0);
    if (!Number.isFinite(n)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
  }, [syndicator]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1400px] space-y-4">
        <SyndicatorsSectionTabs />

        {loadError && (
          <div className="rounded-lg border border-destructive/40 bg-card p-4 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <nav className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            {syndicatorId
              ? ADMIN_TABS.map((t) => {
                  const href = `/syndicators/syndicators-list/${syndicatorId}/${t.path}`;
                  return (
                    <NavLink
                      key={t.path}
                      to={href}
                      end={t.end}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      {t.label}
                    </NavLink>
                  );
                })
              : null}

            {syndicatorId ? (
              <>
                <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                {ADMIN_TOOLS.map((t) => {
                  const href = `/syndicators/syndicators-list/${syndicatorId}/${t.path}`;
                  return (
                    <NavLink
                      key={t.path}
                      to={href}
                      className={({ isActive }) =>
                        cn(
                          'rounded-md px-3 py-2 text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-muted text-foreground'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                        )
                      }
                    >
                      {t.label}
                    </NavLink>
                  );
                })}
              </>
            ) : null}
          </div>
        </nav>

        <div className="rounded-lg border border-border bg-card px-6 py-4 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">ID #{syndicatorId}</p>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Wallet balance</p>
              <p className="text-lg font-semibold tabular-nums">{balance}</p>
            </div>
            {syndicatorId && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 gap-2"
                onClick={() => setAddBalanceOpen(true)}
              >
                <CircleFadingPlus className="h-4 w-4" />
                Add balance
              </Button>
            )}
          </div>
        </div>

        {syndicatorId ? (
          <AddSyndicatorWalletBalanceDialog
            open={addBalanceOpen}
            onOpenChange={setAddBalanceOpen}
            syndicatorId={syndicatorId}
            onSuccess={() => {
              void loadSyndicator();
              setWalletRefreshToken((t) => t + 1);
            }}
          />
        ) : null}

        <div className="pb-8">
          <Outlet
            context={{
              walletRefreshToken,
              bumpWalletRefresh,
              syndicatorName: syndicator ? title : null,
              syndicatorCompany: syndicator?.companyName ?? null,
              currentBalance: syndicator && Number.isFinite(Number(syndicator.currentBalance)) ? Number(syndicator.currentBalance) : null,
            } satisfies SyndicatorAdminOutletContext}
          />
        </div>
      </div>
    </div>
  );
}
