import { Link, Navigate, useRouterState } from '@tanstack/react-router';
import { Button } from '@vertex-shifa/ui';
import { LockKeyholeIcon, UserRoundIcon } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../../components/app-shell';
import { ErrorState } from '../../components/error-state';
import { LoadingState } from '../../components/query-states';
import { StateCard } from '../../components/state-card';
import {
  deviceErrorCode,
  hasDevice,
  type MemberView,
  type RegistrationView,
} from '../../lib/device';
import { logErrorLabel } from '../../lib/error-logging';
import { useOnline } from '../../lib/online';
import { TenantGate } from '../tenancy/tenant-gate';
import { useIdleLock } from './idle-lock';
import { unlockedMember, useInstallation } from './installation';
import { lockSession, refreshDevice } from './session';

/** The screens before a member is signed in (spec S02 screens 1–5). */
const identityPaths = new Set(['/welcome', '/sign-in', '/register', '/pin/new', '/lock']);

/**
 * Every clinic screen needs an unlocked member of the current registration: without one, the
 * lock screen, or the welcome screen on an installation registered nowhere yet. The clinic
 * system is the desktop app only: in a plain browser nothing opens.
 */
export function IdentityGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation('clinic');
  const installation = useInstallation();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (!hasDevice()) {
    return (
      <AppShell>
        <StateCard
          role="status"
          title={t('identity.desktopOnly.title')}
          description={t('identity.desktopOnly.description')}
        />
      </AppShell>
    );
  }
  if (installation.isPending) {
    return (
      <AppShell>
        <LoadingState />
      </AppShell>
    );
  }
  if (installation.isError) {
    return (
      <AppShell>
        <ErrorState
          description={
            deviceErrorCode(installation.error) === 'STORAGE_UNAVAILABLE'
              ? t('identity.storageUnavailable')
              : t('identity.deviceError')
          }
          onRetry={() => void installation.refetch()}
        />
      </AppShell>
    );
  }

  const view = installation.data;
  const signedIn = unlockedMember(view);
  if (identityPaths.has(pathname)) {
    // A member is unlocked: the lock and sign-in screens are behind them (a step back in the
    // history must never show a lock screen over an unlocked app).
    if (signedIn) return <Navigate to="/" replace />;
    if (pathname === '/welcome' && view.registrations.length > 0) {
      return <Navigate to="/lock" replace />;
    }
    return <AppShell>{children}</AppShell>;
  }
  if (!signedIn) {
    return <Navigate to={view.registrations.length > 0 ? '/lock' : '/welcome'} replace />;
  }
  return (
    <AppShell headerEnd={<MemberMenu {...signedIn} />}>
      <SignedIn registration={signedIn.registration}>{children}</SignedIn>
    </AppShell>
  );
}

/** Rule 25: the app locks after the clinic's idle minutes without input. */
function SignedIn({
  registration,
  children,
}: {
  registration: RegistrationView;
  children: ReactNode;
}) {
  useIdleLock(registration.idleLockMinutes, () => void lockSession());
  // Once per start and connection: the clinic's idle minutes and members, or its revocation.
  const online = useOnline();
  const { deviceId, tenantId } = registration;
  useEffect(() => {
    if (online) refreshDevice({ deviceId, tenantId }).catch(logErrorLabel);
  }, [online, deviceId, tenantId]);
  return <TenantGate>{children}</TenantGate>;
}

/** Who is signed in, their account, and the lock. */
function MemberMenu({
  registration,
  member,
}: {
  registration: RegistrationView;
  member: MemberView;
}) {
  const { t } = useTranslation('clinic');
  return (
    <div className="flex items-center gap-1">
      <span className="hidden text-sm text-muted-foreground lg:inline">
        {registration.clinicName}
      </span>
      <Button
        variant="ghost"
        size="sm"
        render={<Link to="/me" />}
        aria-label={t('identity.menu.account', { name: member.name })}
      >
        <UserRoundIcon aria-hidden />
        <span>{member.name || t('identity.lock.unnamed')}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => void lockSession()}>
        <LockKeyholeIcon aria-hidden />
        {t('identity.menu.lock')}
      </Button>
    </div>
  );
}
