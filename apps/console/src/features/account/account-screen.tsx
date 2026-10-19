import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ConsoleMe, consolePolicy } from '@vertex-shifa/contracts';
import {
  Button,
  Callout,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  FormFields,
  PageHeader,
  PasswordInput,
  toast,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { QueryStates } from '../../components/query-states';
import { api, unwrap } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { PasswordHints, passwordHints } from '../session/password-hints';
import { meQuery } from '../session/session';

/** Few enough recovery codes left to say so. */
const LOW_RECOVERY_CODES = 3;

/**
 * `/me` (screen 15): the platform user's name, phone and role, the recovery codes left, and a new
 * password, which ends their other sessions.
 */
export function AccountScreen() {
  const { t } = useTranslation('console');
  const me = useQuery(meQuery);
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <PageHeader title={t('account.title')} description={t('account.description')} />
      <QueryStates queries={[me]}>
        {() => (
          <>
            <Profile me={me.data as ConsoleMe} />
            <RecoveryCodes remaining={(me.data as ConsoleMe).recoveryCodesRemaining} />
            <ChangePassword phone={(me.data as ConsoleMe).phone} />
          </>
        )}
      </QueryStates>
    </section>
  );
}

function Profile({ me }: { me: ConsoleMe }) {
  const { t } = useTranslation('console');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{me.name}</CardTitle>
        <CardDescription className="flex flex-col gap-1">
          <span>
            {t('account.phone')}{' '}
            <bdi dir="ltr" className="text-foreground">
              {me.phone}
            </bdi>
          </span>
          <span>
            {t('account.role')} <span className="text-foreground">{t(`roles.${me.role}`)}</span>
          </span>
          <span>{t('account.phoneHint')}</span>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function RecoveryCodes({ remaining }: { remaining: number }) {
  const { t } = useTranslation('console');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('account.recoveryTitle')}</CardTitle>
        <CardDescription>
          {t('account.recoveryRemaining', {
            count: remaining,
            total: consolePolicy.recoveryCodes,
          })}
        </CardDescription>
      </CardHeader>
      {remaining <= LOW_RECOVERY_CODES && (
        <Callout
          role="status"
          tone={remaining === 0 ? 'danger' : 'warning'}
          title={remaining === 0 ? t('account.recoveryNone') : t('account.recoveryLow')}
        />
      )}
    </Card>
  );
}

function ChangePassword({ phone }: { phone: string }) {
  const { t } = useTranslation('console');
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const online = useOnline();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [checking, setChecking] = useState(false);
  const hints = passwordHints(next, phone);
  const currentError = checking && current === '' ? t('signIn.passwordRequired') : undefined;
  const nextError = checking && !(hints.length && hints.common) ? t('password.weak') : undefined;

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/console/me/password', {
          body: { currentPassword: current, newPassword: next },
        }),
      ),
    onSuccess: async () => {
      setCurrent('');
      setNext('');
      setChecking(false);
      toast.add({ title: t('account.passwordChanged'), type: 'success' });
      await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
    },
  });

  function submit(): boolean {
    setChecking(true);
    if (current === '' || !(hints.length && hints.common)) return false;
    save.mutate();
    return true;
  }

  return (
    <Form onSubmit={submit} busy={save.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('account.passwordTitle')}</CardTitle>
          <CardDescription>{t('account.passwordDescription')}</CardDescription>
        </div>
        <OfflineNotice />
        <FormFields>
          <Field invalid={currentError !== undefined}>
            <FieldLabel>{t('account.currentPassword')}</FieldLabel>
            <PasswordInput
              autoComplete="current-password"
              value={current}
              onValueChange={setCurrent}
              showLabel={t('password.show')}
              hideLabel={t('password.hide')}
            />
            <FieldError match={currentError !== undefined}>{currentError}</FieldError>
          </Field>
          <Field invalid={nextError !== undefined}>
            <FieldLabel>{t('account.newPassword')}</FieldLabel>
            <PasswordInput
              autoComplete="new-password"
              value={next}
              onValueChange={setNext}
              showLabel={t('password.show')}
              hideLabel={t('password.hide')}
            />
            <PasswordHints hints={hints} />
            <FieldError match={nextError !== undefined}>{nextError}</FieldError>
          </Field>
        </FormFields>
        <FormActions>
          <Button
            type="submit"
            loading={save.isPending}
            disabled={!online || current === '' || next === ''}
          >
            {t('account.changePassword')}
          </Button>
        </FormActions>
        {save.error && <Callout role="alert" tone="danger" title={errorText(save.error)} />}
      </Card>
    </Form>
  );
}
