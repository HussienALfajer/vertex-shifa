import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useRouterState } from '@tanstack/react-router';
import type { ConsoleMe } from '@vertex-shifa/contracts';
import { Button, toast } from '@vertex-shifa/ui';
import { LogOutIcon, UserRoundIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell } from '../../components/app-shell';
import { QueryStates } from '../../components/query-states';
import { apiErrorCode } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { ReauthProvider } from './reauth';
import { holds, meQuery, signOut } from './session';

/**
 * Every screen but the sign-in needs a console session (rule 37): without one the person goes to
 * `/sign-in`. Signed in, the shell shows who it is, the navigation and the sign-out, and sensitive
 * actions can ask for a TOTP (`ReauthProvider`).
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname === '/sign-in') return <AppShell>{children}</AppShell>;
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
    <AppShell headerEnd={me.data && <UserMenu me={me.data} />}>
      <QueryStates queries={[me]}>
        {() => (
          <ReauthProvider>
            <div className="flex flex-col gap-6">
              <MainNav me={me.data as ConsoleMe} />
              {children}
            </div>
          </ReauthProvider>
        )}
      </QueryStates>
    </AppShell>
  );
}

/** The console's screens; platform users show to admins (cosmetic: the API decides). */
function MainNav({ me }: { me: ConsoleMe }) {
  const { t } = useTranslation('console');
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
      {holds(me, 'platform-users.manage') && (
        <Button variant="ghost" className={link} render={<Link to="/platform-users" />}>
          {t('nav.platformUsers')}
        </Button>
      )}
      <Button variant="ghost" className={link} render={<Link to="/me" />}>
        {t('nav.account')}
      </Button>
    </nav>
  );
}

/** Who is signed in, and the sign-out, which ends the session on the server. */
function UserMenu({ me }: { me: ConsoleMe }) {
  const { t } = useTranslation('console');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const errorText = useErrorText();
  const out = useMutation({
    mutationFn: () => signOut(queryClient),
    onSuccess: async () => {
      toast.add({ title: t('session.signedOut'), type: 'success' });
      await navigate({ to: '/sign-in', replace: true });
    },
    onError: (error) => toast.add({ title: errorText(error), type: 'error' }),
  });
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        render={<Link to="/me" />}
        aria-label={t('nav.accountOf', { name: me.name })}
      >
        <UserRoundIcon aria-hidden />
        <span>{me.name}</span>
      </Button>
      <Button variant="ghost" size="sm" loading={out.isPending} onClick={() => out.mutate()}>
        <LogOutIcon aria-hidden />
        {t('nav.signOut')}
      </Button>
    </div>
  );
}
