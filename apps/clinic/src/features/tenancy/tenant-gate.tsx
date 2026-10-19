import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, Navigate, useRouterState } from '@tanstack/react-router';
import type { Tenant } from '@vertex-shifa/contracts';
import { Button } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryStates } from '../../components/query-states';
import { facilitiesQuery, tenantQuery } from './queries';
import { ReadOnlyBanner } from './read-only-banner';

/**
 * The clinic's tenant, for every screen inside the gate (which loaded it first, so this never
 * suspends).
 */
export function useTenant(): Tenant {
  return useSuspenseQuery(tenantQuery).data;
}

/**
 * Every clinic screen needs the tenant first. While it is onboarding, only the setup screen (and
 * the member's account) is reachable (rule 4); after, the setup screen leads home. Suspended or closed, the read-only banner
 * stays above every screen (screen 7).
 */
export function TenantGate({ children }: { children: ReactNode }) {
  const tenant = useQuery(tenantQuery);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <QueryStates queries={[tenant]}>
      {() => {
        const { status } = tenant.data as Tenant;
        const onSetup = pathname === '/setup';
        // The member's own account is theirs in every status.
        const onAccount = pathname === '/me';
        if (status === 'onboarding' && !onSetup && !onAccount) {
          return <Navigate to="/setup" replace />;
        }
        if (status !== 'onboarding' && onSetup) return <Navigate to="/" replace />;
        return (
          <div className="flex flex-col gap-6">
            <ReadOnlyBanner tenant={tenant.data as Tenant} />
            {status !== 'onboarding' && <MainNav />}
            {children}
          </div>
        );
      }}
    </QueryStates>
  );
}

/**
 * The clinic's screens. A single-branch clinic never sees the word "branch" (rule 9): its
 * location screen stands where the branch list would.
 */
function MainNav() {
  const { t } = useTranslation('clinic');
  const branches = useQuery(facilitiesQuery(false));
  const several = (branches.data?.total ?? 0) >= 2;
  const link = 'data-[status=active]:bg-muted data-[status=active]:font-bold';
  return (
    <nav aria-label={t('nav.label')} className="flex flex-wrap gap-1 border-b border-border pb-2">
      <Button
        variant="ghost"
        className={link}
        render={<Link to="/" activeOptions={{ exact: true }} />}
      >
        {t('nav.home')}
      </Button>
      <Button variant="ghost" className={link} render={<Link to="/settings/clinic" />}>
        {t('nav.clinic')}
      </Button>
      {branches.data &&
        (several ? (
          <Button variant="ghost" className={link} render={<Link to="/settings/branches" />}>
            {t('nav.branches')}
          </Button>
        ) : (
          <Button variant="ghost" className={link} render={<Link to="/settings/location" />}>
            {t('nav.location')}
          </Button>
        ))}
    </nav>
  );
}
