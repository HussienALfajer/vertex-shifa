import { useMutation } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { isWeakPin } from '@vertex-shifa/contracts';
import {
  BackButton,
  Button,
  Callout,
  Card,
  Form,
  FormActions,
  FormFields,
  PageHeader,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { api, apiErrorCode, TICKET_HEADER, unwrap } from '../../lib/api';
import { device, deviceErrorCode, type RegistrationView } from '../../lib/device';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { CodeField } from './code-fields';
import { type SignInFlow, setSignInFlow, useSignInFlow } from './flow';
import { useInstallation } from './installation';
import { asDevice, clearLockReason, deviceInfo, remember, sessionStarted } from './session';

/**
 * `/pin/new` (screen 4, rules 20–21): the PIN twice. Then the installation makes the keys, the API
 * registers the computer or enrolls the member, and the member is signed in.
 */
export function NewPinScreen() {
  const flow = useSignInFlow();
  const installation = useInstallation();
  if (!installation.data) return null;
  const registration = installation.data.registrations.find(
    (item) => item.deviceId === flow?.deviceId && item.status === 'active',
  );
  const ready = flow && (flow.purpose === 'register' ? flow.registration !== null : registration);
  if (!ready) {
    return (
      <Navigate to={installation.data.registrations.length > 0 ? '/lock' : '/welcome'} replace />
    );
  }
  return <NewPinForm flow={flow} registration={registration} />;
}

function NewPinForm({
  flow,
  registration,
}: {
  flow: SignInFlow;
  registration: RegistrationView | undefined;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const online = useOnline();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [checking, setChecking] = useState(false);
  const weak = pin.length === 6 && isWeakPin(pin, flow.phone);
  const pinError =
    checking && (pin.length !== 6 || weak)
      ? weak
        ? t('identity.pin.weak')
        : t('identity.pin.incomplete')
      : undefined;
  const confirmError =
    checking && !pinError && confirm !== pin ? t('identity.pin.mismatch') : undefined;

  const finish = useMutation({
    mutationFn: async () => {
      if (flow.purpose === 'register' && flow.registration) {
        await register(flow, flow.registration, pin);
      } else if (registration) {
        await enroll(flow, registration, pin);
      }
      setSignInFlow(null);
      clearLockReason();
      await navigate({ to: '/', replace: true });
    },
  });

  function submit(): boolean {
    setChecking(true);
    if (pin.length !== 6 || weak || confirm !== pin) return false;
    finish.mutate();
    return true;
  }

  const refusal = deviceErrorCode(finish.error);
  const code = apiErrorCode(finish.error);
  const back = flow.purpose === 'register' ? '/register' : '/lock';
  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader
        back={
          <BackButton render={<Link to={back} />}>
            {back === '/lock' ? t('identity.lock.back') : t('identity.register.back')}
          </BackButton>
        }
        title={t('identity.pin.newTitle')}
        description={t('identity.pin.newDescription')}
      />
      <OfflineNotice description={t('identity.offline.signIn')} />
      <Form onSubmit={submit} busy={finish.isPending}>
        <Card className="flex flex-col gap-6 p-6">
          <FormFields>
            <CodeField
              mask
              autoFocus
              label={t('identity.pin.new')}
              description={t('identity.pin.rule')}
              error={pinError}
              value={pin}
              onValueChange={setPin}
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
            <Button type="submit" loading={finish.isPending} disabled={!online}>
              {flow.purpose === 'register' ? t('identity.pin.register') : t('identity.pin.save')}
            </Button>
          </FormActions>
          {finish.error && (
            <Callout
              role="alert"
              tone="danger"
              title={
                refusal === 'ALREADY_REGISTERED'
                  ? t('identity.register.alreadyRegistered')
                  : refusal === 'PIN_WEAK'
                    ? t('identity.pin.weak')
                    : refusal
                      ? t('identity.deviceError')
                      : errorText(finish.error)
              }
              action={
                code === 'TICKET_INVALID' && (
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link to={back === '/lock' ? '/lock' : '/welcome'} />}
                  >
                    {t('identity.signIn.startOver')}
                  </Button>
                )
              }
            />
          )}
        </Card>
      </Form>
    </section>
  );
}

/** Rule 18: registers this computer to the chosen clinic and enrolls the member in one step. */
async function register(
  flow: SignInFlow,
  choice: NonNullable<SignInFlow['registration']>,
  pin: string,
): Promise<void> {
  const keys = await device('prepareKeys', { tenantId: choice.tenantId, phone: flow.phone, pin });
  try {
    const { os, appVersion } = await deviceInfo();
    const registered = await unwrap(
      api.POST('/api/devices', {
        headers: { [TICKET_HEADER]: flow.ticket },
        body: {
          tenantId: choice.tenantId,
          facilityId: choice.facilityId,
          name: choice.deviceName,
          publicKey: keys.devicePublicKey ?? '',
          os,
          appVersion,
          userPublicKey: keys.userPublicKey,
        },
      }),
    );
    remember(
      await device('completeRegistration', {
        pendingId: keys.pendingId,
        deviceId: registered.device.id,
        tenantId: registered.device.tenantId,
        clinicName: choice.clinicName,
        clinicNameLatin: choice.clinicNameLatin,
        facilityName: choice.facilityName,
        member: {
          enrollmentId: registered.enrollment.id,
          membershipId: registered.enrollment.membershipId,
          name: flow.name,
          roles: choice.roles,
        },
        lastConfirmedAt: registered.enrollment.lastConfirmedAt,
        session: registered.session,
      }),
    );
    void sessionStarted({ deviceId: registered.device.id, tenantId: registered.device.tenantId });
  } catch (error) {
    await device('discardKeys', { pendingId: keys.pendingId }).catch(() => undefined);
    throw error;
  }
}

/** Rules 20 and 22: enrolls the member on this computer (again, after a forgotten PIN). */
async function enroll(
  flow: SignInFlow,
  registration: RegistrationView,
  pin: string,
): Promise<void> {
  const keys = await device('prepareKeys', {
    deviceId: registration.deviceId,
    phone: flow.phone,
    pin,
  });
  try {
    const enrolled = await asDevice(registration, (headers) =>
      api.POST('/api/devices/current/enrollments', {
        headers: { ...headers, [TICKET_HEADER]: flow.ticket },
        body: { userPublicKey: keys.userPublicKey },
      }),
    );
    remember(
      await device('completeEnrollment', {
        pendingId: keys.pendingId,
        member: {
          enrollmentId: enrolled.enrollment.id,
          membershipId: enrolled.enrollment.membershipId,
          name: flow.name,
          roles: [],
        },
        lastConfirmedAt: enrolled.enrollment.lastConfirmedAt,
        session: enrolled.session,
      }),
    );
    void sessionStarted(registration);
  } catch (error) {
    await device('discardKeys', { pendingId: keys.pendingId }).catch(() => undefined);
    throw error;
  }
}
