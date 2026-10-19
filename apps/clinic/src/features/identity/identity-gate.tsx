import { Link, Navigate, useRouterState } from '@tanstack/react-router';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@vertex-shifa/ui';
import { ChevronDownIcon, CircleUserIcon, LockKeyholeIcon } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell, AuthShell } from '../../components/app-shell';
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
import { ClinicNav } from '../tenancy/clinic-nav';
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
      <AuthShell>
        <StateCard
          role="status"
          title={t('identity.desktopOnly.title')}
          description={t('identity.desktopOnly.description')}
        />
      </AuthShell>
    );
  }
  if (installation.isPending) {
    return (
      <AuthShell>
        <LoadingState />
      </AuthShell>
    );
  }
  if (installation.isError) {
    return (
      <AuthShell>
        <ErrorState
          description={
            deviceErrorCode(installation.error) === 'STORAGE_UNAVAILABLE'
              ? t('identity.storageUnavailable')
              : t('identity.deviceError')
          }
          onRetry={() => void installation.refetch()}
        />
      </AuthShell>
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
    return <AuthShell>{children}</AuthShell>;
  }
  if (!signedIn) {
    return <Navigate to={view.registrations.length > 0 ? '/lock' : '/welcome'} replace />;
  }
  return (
    <AppShell navigation={<ClinicNav />} headerEnd={<MemberMenu {...signedIn} />}>
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

/**
 * Who is signed in (Vertex Hub's user menu: the avatar, the name from the `sm` breakpoint), their
 * account, and the lock, which stays one press away beside the menu from 384 px.
 */
function MemberMenu({
  registration,
  member,
}: {
  registration: RegistrationView;
  member: MemberView;
}) {
  const { t } = useTranslation(['clinic', 'common']);
  const name = member.name || t('identity.lock.unnamed');
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              // On the narrowest phones the lock waits in the menu, so the brand keeps its room.
              className="hidden min-[24rem]:inline-flex"
              onClick={() => void lockSession()}
              aria-label={t('identity.menu.lock')}
            />
          }
        >
          <LockKeyholeIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent>{t('identity.menu.lock')}</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              className="h-10 gap-2 px-2"
              aria-label={t('common:shell.userMenu', { name })}
            />
          }
        >
          <Avatar name={name} size="sm" className="size-8" />
          <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{name}</span>
          <ChevronDownIcon aria-hidden className="hidden size-4 text-muted-foreground sm:block" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-60">
          <DropdownMenuHeader>
            <span className="font-medium wrap-anywhere">{name}</span>
            <span className="text-sm text-muted-foreground wrap-anywhere">
              {registration.clinicName}
            </span>
          </DropdownMenuHeader>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link to="/me" />}>
            <CircleUserIcon aria-hidden />
            {t('identity.account.title')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void lockSession()}>
            <LockKeyholeIcon aria-hidden />
            {t('identity.menu.lock')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
