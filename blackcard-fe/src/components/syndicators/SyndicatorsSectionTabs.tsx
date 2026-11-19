import { useMemo } from 'react';
import { Link, useLocation } from 'react-router';
import { cn } from '@/lib/utils';

const ITEMS = [
  { label: 'Dashboard', to: '/syndicators/dashboard' },
  { label: 'Syndicators List', to: '/syndicators/syndicators-list' },
];

export default function SyndicatorsSectionTabs() {
  const location = useLocation();

  const activePath = useMemo(() => {
    if (location.pathname.startsWith('/syndicators/syndicators-list')) {
      return '/syndicators/syndicators-list';
    }
    return '/syndicators/dashboard';
  }, [location.pathname]);

  return (
    <div className="rounded-lg border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        {ITEMS.map((item) => {
          const isActive = activePath === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
