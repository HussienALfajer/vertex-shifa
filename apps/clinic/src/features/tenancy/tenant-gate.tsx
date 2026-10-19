import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Navigate, useRouterState } from '@tanstack/react-router';
import type { Tenant } from '@vertex-shifa/contracts';
import type { ReactNode } from 'react';
import { QueryStates } from '../../components/query-states';
import { tenantQuery } from './queries';
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
 * stays above every screen (screen 7). The navigation is in the shell's sidebar (`ClinicNav`).
 */
export function TenantGate({ children }: { children: ReactNode }) {
  const tenant = useQuery(tenantQuery);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <QueryStates queries={[tenant]}>
      {() => {
        const { status } = tenant.data as Tenant;
        const onSetup = pathname === '/setup';
        // The member's own account and doctor profile are theirs in every status.
        const onAccount = pathname === '/me' || pathname.startsWith('/me/');
        if (status === 'onboarding' && !onSetup && !onAccount) {
          return <Navigate to="/setup" replace />;
        }
        if (status !== 'onboarding' && onSetup) return <Navigate to="/" replace />;
        return (
          <div className="flex flex-col gap-6">
            <ReadOnlyBanner tenant={tenant.data as Tenant} />
            {children}
          </div>
        );
      }}
    </QueryStates>
  );
}
