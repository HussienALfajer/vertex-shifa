import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useRouterState } from '@tanstack/react-router';
import type { ConsoleMe } from '@vertex-shifa/contracts';
import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHeader,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SidebarLink,
  SidebarNav,
  toast,
} from '@vertex-shifa/ui';
import { ChevronDownIcon, CircleUserIcon, HouseIcon, LogOutIcon, UsersIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell, AuthShell } from '../../components/app-shell';
import { QueryStates } from '../../components/query-states';
import { apiErrorCode } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { ReauthProvider } from './reauth';
import { forgetSession, holds, meQuery, signOut } from './session';

/**
 * Every screen but the sign-in needs a console session (rule 37): without one the person goes to
 * `/sign-in`. Signed in, the shell shows who it is, the navigation and the sign-out, and sensitive
 * actions can ask for a TOTP (`ReauthProvider`).
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === '/sign-in') return <AuthShell>{children}</AuthShell>;
  return <SignedIn>{children}</SignedIn>;
}

function SignedIn({ children }: { children: ReactNode }) {
  const me = useQuery(meQuery);
  const code = apiErrorCode(me.error);
  if (code === 'UNAUTHENTICATED' || code === 'SESSION_ENDED') {
    return (
      <Navigate to="/sign-in" search={code === 'SESSION_ENDED' ? { ended: true } : {}} replace />
    );
  }
  return (
    <AppShell
      navigation={me.data && <MainNav me={me.data} />}
      headerEnd={me.data && <UserMenu me={me.data} />}
    >
      <QueryStates queries={[me]}>{() => <ReauthProvider>{children}</ReauthProvider>}</QueryStates>
    </AppShell>
  );
}

/** The console's screens, in the sidebar; platform users show to admins (cosmetic: the API decides). */
function MainNav({ me }: { me: ConsoleMe }) {
  const { t } = useTranslation('console');
  return (
    <SidebarNav aria-label={t('nav.label')}>
      <SidebarLink render={<Link to="/" activeOptions={{ exact: true }} />}>
        <HouseIcon aria-hidden />
        {t('nav.home')}
      </SidebarLink>
      {holds(me, 'platform-users.manage') && (
        <SidebarLink render={<Link to="/platform-users" />}>
          <UsersIcon aria-hidden />
          {t('nav.platformUsers')}
        </SidebarLink>
      )}
    </SidebarNav>
  );
}

/**
 * Who is signed in (Vertex Hub's user menu: the avatar, the name from the `sm` breakpoint), their
 * account, and the sign-out, which ends the session on the server.
 */
function UserMenu({ me }: { me: ConsoleMe }) {
  const { t } = useTranslation(['console', 'common']);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const out = useMutation({
    mutationFn: signOut,
    onSuccess: async () => {
      forgetSession(queryClient);
      toast.add({ title: t('session.signedOut'), type: 'success' });
      await navigate({ to: '/sign-in', replace: true });
    },
    onError: (error) => toast.add({ title: errorText(error), type: 'error' }),
  });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-10 gap-2 px-2"
            aria-label={t('common:shell.userMenu', { name: me.name })}
          />
        }
      >
        <Avatar name={me.name} size="sm" className="size-8" />
        <span className="hidden max-w-40 truncate text-sm font-medium sm:inline">{me.name}</span>
        <ChevronDownIcon aria-hidden className="hidden size-4 text-muted-foreground sm:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-60">
        <DropdownMenuHeader>
          <span className="font-medium wrap-anywhere">{me.name}</span>
        </DropdownMenuHeader>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/me" />}>
          <CircleUserIcon aria-hidden />
          {t('nav.account')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={out.isPending} onClick={() => out.mutate()}>
          <LogOutIcon aria-hidden className="rtl:-scale-x-100" />
          {t('nav.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
