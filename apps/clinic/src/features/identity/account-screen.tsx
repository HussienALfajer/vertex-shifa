import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { isWeakPin, type Me } from '@vertex-shifa/contracts';
import {
  BackButton,
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
import { device, deviceErrorCode, type MemberView, type RegistrationView } from '../../lib/device';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { meQuery } from '../../lib/staff-access';
import { CodeField } from './code-fields';
import { unlockedMember, useInstallation } from './installation';
import { remember } from './session';
import { PasswordHints, passwordHints } from './sign-in-screen';

/**
 * `/me` (screen 11): the member's name and phone (read-only: the owner or Vertex changes a phone),
 * their password, and their PIN on this computer, which works offline.
 */
export function AccountScreen() {
  const { t } = useTranslation('clinic');
  const me = useQuery(meQuery);
  const installation = useInstallation();
  const signedIn = installation.data && unlockedMember(installation.data);
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/" />}>{t('nav.home')}</BackButton>}
        title={t('identity.account.title')}
        description={t('identity.account.description')}
      />
      <QueryStates queries={[me]}>
        {() => (
          <>
            <Profile me={me.data as Me} />
            <ChangePassword phone={(me.data as Me).account.phone} />
          </>
        )}
      </QueryStates>
      {signedIn && <ChangePin registration={signedIn.registration} member={signedIn.member} />}
    </section>
  );
}

function Profile({ me }: { me: Me }) {
  const { t } = useTranslation('clinic');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{me.account.nameAr ?? ''}</CardTitle>
        <CardDescription className="flex flex-col gap-1">
          <span>
            {t('identity.account.phone')}{' '}
            <bdi dir="ltr" className="text-foreground">
              {me.account.phone}
            </bdi>
          </span>
          <span>{t('identity.account.phoneHint')}</span>
        </CardDescription>
      </CardHeader>
      {me.practitioner && (
        <div>
          <Button variant="outline" render={<Link to="/me/profile" />}>
            {t('practitioner.ownTitle')}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ChangePassword({ phone }: { phone: string }) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const online = useOnline();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [checking, setChecking] = useState(false);
  const hints = passwordHints(next, phone);
  const currentError =
    checking && current === '' ? t('identity.signIn.passwordRequired') : undefined;
  const nextError =
    checking && !(hints.length && hints.common) ? t('identity.password.weak') : undefined;

  const save = useMutation({
    mutationFn: () =>
      unwrap(
        api.PUT('/api/me/password', { body: { currentPassword: current, newPassword: next } }),
      ),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setChecking(false);
      toast.add({ title: t('identity.account.passwordChanged'), type: 'success' });
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
        <CardTitle>{t('identity.account.passwordTitle')}</CardTitle>
        <OfflineNotice />
        <FormFields>
          <Field invalid={currentError !== undefined}>
            <FieldLabel>{t('identity.account.currentPassword')}</FieldLabel>
            <PasswordInput
              autoComplete="current-password"
              value={current}
              onValueChange={setCurrent}
              showLabel={t('identity.password.show')}
              hideLabel={t('identity.password.hide')}
            />
            <FieldError match={currentError !== undefined}>{currentError}</FieldError>
          </Field>
          <Field invalid={nextError !== undefined}>
            <FieldLabel>{t('identity.account.newPassword')}</FieldLabel>
            <PasswordInput
              autoComplete="new-password"
              value={next}
              onValueChange={setNext}
              showLabel={t('identity.password.show')}
              hideLabel={t('identity.password.hide')}
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
            {t('identity.account.changePassword')}
          </Button>
        </FormActions>
        {save.error && <Callout role="alert" tone="danger" title={errorText(save.error)} />}
      </Card>
    </Form>
  );
}

/** A new PIN for the member's key on this computer only; offline too. */
function ChangePin({
  registration,
  member,
}: {
  registration: RegistrationView;
  member: MemberView;
}) {
  const { t } = useTranslation('clinic');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const weak = next.length === 6 && isWeakPin(next, member.phone);
  const nextError =
    checking && (next.length !== 6 || weak)
      ? weak
        ? t('identity.pin.weak')
        : t('identity.pin.incomplete')
      : undefined;
  const confirmError =
    checking && !nextError && confirm !== next ? t('identity.pin.mismatch') : undefined;

  const change = useMutation({
    mutationFn: () =>
      device('changePin', {
        deviceId: registration.deviceId,
        enrollmentId: member.enrollmentId,
        currentPin: current,
        newPin: next,
      }),
    onSuccess: async (result) => {
      remember(await device('view', null));
      if (result.result === 'changed') {
        setCurrent('');
        setNext('');
        setConfirm('');
        setChecking(false);
        toast.add({ title: t('identity.account.pinChanged'), type: 'success' });
        return;
      }
      setCurrent('');
      setError(
        result.result === 'wrong_pin'
          ? t('identity.lock.wrongPin', { remaining: result.attemptsLeft })
          : t('identity.lock.pinDisabledTitle'),
      );
    },
    onError: (failure) =>
      setError(
        deviceErrorCode(failure) === 'PIN_WEAK'
          ? t('identity.pin.weak')
          : t('identity.deviceError'),
      ),
  });

  function submit(): boolean {
    setChecking(true);
    setError(undefined);
    if (current.length !== 6 || next.length !== 6 || weak || confirm !== next) return false;
    change.mutate();
    return true;
  }

  return (
    <Form onSubmit={submit} busy={change.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('identity.account.pinTitle')}</CardTitle>
          <CardDescription>
            {t('identity.account.pinDescription', { clinic: registration.clinicName })}
          </CardDescription>
        </div>
        <FormFields>
          <CodeField
            mask
            label={t('identity.account.currentPin')}
            error={
              error ?? (checking && current.length !== 6 ? t('identity.pin.incomplete') : undefined)
            }
            value={current}
            onValueChange={setCurrent}
          />
          <CodeField
            mask
            label={t('identity.account.newPin')}
            description={t('identity.pin.rule')}
            error={nextError}
            value={next}
            onValueChange={setNext}
          />
          <CodeField
            mask
            label={t('identity.pin.confirm')}
            error={confirmError}
            value={confirm}
            onValueChange={setConfirm}
          />
        </FormFields>
        <FormActions>
          <Button type="submit" loading={change.isPending}>
            {t('identity.account.changePin')}
          </Button>
        </FormActions>
      </Card>
    </Form>
  );
}
