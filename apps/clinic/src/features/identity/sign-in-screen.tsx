import { useMutation } from '@tanstack/react-query';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import {
  isWeakPassword,
  otpPolicy,
  parsePhoneNumber,
  passwordPolicy,
  signInPolicy,
} from '@vertex-shifa/contracts';
import {
  BackButton,
  Button,
  Callout,
  Card,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  FormFields,
  Input,
  PageHeader,
  PasswordInput,
} from '@vertex-shifa/ui';
import { CheckIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { apiErrorCode } from '../../lib/api';
import {
  device,
  type InstallationView,
  type MemberView,
  type RegistrationView,
} from '../../lib/device';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { CodeField } from './code-fields';
import { type SignInPurpose, setSignInFlow } from './flow';
import { currentRegistration, useInstallation } from './installation';
import { remember } from './session';
import {
  registrationOptions,
  requestFirstSignIn,
  resendOtp,
  setFirstPassword,
  signIn,
  verifyOtp,
} from './sign-in-api';

export type SignInSearch = { purpose: SignInPurpose; first?: boolean; member?: string };

type Step =
  | { kind: 'credentials' }
  | { kind: 'otp'; challengeId: string; phone: string; sentAt: number }
  | { kind: 'password'; ticket: string; phone: string; name: string }
  | { kind: 'noClinic' };

/**
 * `/sign-in` (screen 2): phone and password, then the OTP sent by WhatsApp; or, the first time,
 * phone, OTP, name and password. What follows depends on why the person signs in (`purpose`).
 */
export function SignInScreen({ search }: { search: SignInSearch }) {
  const installation = useInstallation();
  if (!installation.data) return null;
  const view = installation.data;
  const registration = currentRegistration(view);
  const active = registration?.status === 'active' ? registration : undefined;
  const member = active?.members.find((item) => item.enrollmentId === search.member);
  // Signing in on this computer needs a registration, and the PIN routes their member.
  if (search.purpose !== 'register' && !active) return <Navigate to="/welcome" replace />;
  if ((search.purpose === 'forgot' || search.purpose === 'reenable') && !member) {
    return <Navigate to="/lock" replace />;
  }
  return (
    <SignInSteps
      key={`${search.purpose}:${search.first ? 'first' : 'password'}`}
      search={search}
      view={view}
      registration={search.purpose === 'register' ? undefined : active}
      member={member}
    />
  );
}

function SignInSteps({
  search,
  view,
  registration,
  member,
}: {
  search: SignInSearch;
  view: InstallationView;
  registration: RegistrationView | undefined;
  member: MemberView | undefined;
}) {
  const { t } = useTranslation('clinic');
  const navigate = useNavigate();
  const first = search.first === true;
  const [step, setStep] = useState<Step>({ kind: 'credentials' });

  /** The person proved who they are: on to the registration, the PIN, or back to the lock. */
  async function signedIn(ticket: string, phone: string, name: string, enrolled: boolean) {
    if (search.purpose === 'reenable' && enrolled && registration && member) {
      remember(
        await device('reenablePin', {
          deviceId: registration.deviceId,
          enrollmentId: member.enrollmentId,
        }),
      );
      await navigate({ to: '/lock', search: { member: member.enrollmentId } });
      return;
    }
    if (search.purpose === 'register') {
      const options = await registrationOptions(ticket);
      // Rule 19: never a second registration to a clinic this computer holds.
      const registered = new Set(
        view.registrations.filter((item) => item.status === 'active').map((item) => item.tenantId),
      );
      const clinics = options.clinics.filter((clinic) => !registered.has(clinic.tenantId));
      if (clinics.length === 0) {
        setStep({ kind: 'noClinic' });
        return;
      }
      setSignInFlow({
        purpose: 'register',
        deviceId: null,
        phone,
        name,
        ticket,
        clinics,
        registration: null,
      });
      await navigate({ to: '/register' });
      return;
    }
    setSignInFlow({
      purpose: search.purpose,
      deviceId: registration?.deviceId ?? null,
      phone,
      name: name || member?.name || '',
      ticket,
      clinics: [],
      registration: null,
    });
    await navigate({ to: '/pin/new' });
  }

  const titles: Record<SignInPurpose, string> = {
    register: first ? t('identity.signIn.firstTitle') : t('identity.signIn.registerTitle'),
    enroll: first ? t('identity.signIn.firstTitle') : t('identity.signIn.enrollTitle'),
    forgot: t('identity.signIn.forgotTitle'),
    reenable: t('identity.signIn.reenableTitle'),
  };
  const descriptions: Record<SignInPurpose, string> = {
    register: first
      ? t('identity.signIn.firstDescription')
      : t('identity.signIn.registerDescription'),
    enroll: first ? t('identity.signIn.firstDescription') : t('identity.signIn.enrollDescription'),
    forgot: t('identity.signIn.forgotDescription'),
    reenable: t('identity.signIn.reenableDescription'),
  };
  const back = view.registrations.length > 0 ? '/lock' : '/welcome';

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader
        back={
          <BackButton render={<Link to={back} />}>
            {back === '/lock' ? t('identity.lock.back') : t('identity.welcome.back')}
          </BackButton>
        }
        title={titles[search.purpose]}
        description={descriptions[search.purpose]}
      />
      <OfflineNotice description={t('identity.offline.signIn')} />
      {step.kind === 'credentials' && (
        <CredentialsStep
          first={first}
          purpose={search.purpose}
          registration={registration}
          member={member}
          onOtp={(challengeId, phone) =>
            setStep({ kind: 'otp', challengeId, phone, sentAt: Date.now() })
          }
          onDone={(ticket, phone) => signedIn(ticket, phone, member?.name ?? '', true)}
        />
      )}
      {step.kind === 'otp' && (
        <OtpStep
          step={step}
          onResent={(challengeId) => setStep({ ...step, challengeId, sentAt: Date.now() })}
          onRestart={() => setStep({ kind: 'credentials' })}
          onVerified={async (verified) => {
            const name = verified.suggestedName ?? '';
            if (verified.needsPassword) {
              setStep({ kind: 'password', ticket: verified.ticket, phone: step.phone, name });
              return;
            }
            await signedIn(verified.ticket, step.phone, name, false);
          }}
        />
      )}
      {step.kind === 'password' && (
        <FirstPasswordStep
          step={step}
          onDone={(ticket, name) => signedIn(ticket, step.phone, name, false)}
        />
      )}
      {step.kind === 'noClinic' && (
        <Callout
          role="alert"
          tone="warning"
          title={t('identity.signIn.noClinicTitle')}
          description={t('identity.signIn.noClinicDescription')}
        />
      )}
      {search.purpose !== 'forgot' &&
        search.purpose !== 'reenable' &&
        step.kind === 'credentials' && (
          <p className="text-sm text-muted-foreground">
            {first ? t('identity.signIn.haveAccount') : t('identity.signIn.firstTimeQuestion')}{' '}
            <Link
              to="/sign-in"
              search={{ purpose: search.purpose, first: !first }}
              className="font-medium text-foreground underline underline-offset-4"
            >
              {first ? t('identity.signIn.withPassword') : t('identity.signIn.withPhone')}
            </Link>
          </p>
        )}
    </section>
  );
}

/** Phone and password, or the phone alone the first time. */
function CredentialsStep({
  first,
  purpose,
  registration,
  member,
  onOtp,
  onDone,
}: {
  first: boolean;
  purpose: SignInPurpose;
  registration: RegistrationView | undefined;
  member: MemberView | undefined;
  onOtp: (challengeId: string, phone: string) => void;
  onDone: (ticket: string, phone: string) => Promise<void>;
}) {
  const { t } = useTranslation(['clinic', 'common']);
  const errorText = useErrorText();
  const online = useOnline();
  const [phone, setPhone] = useState(member?.phone ?? '');
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const parsed = parsePhoneNumber(phone);
  const phoneError =
    checking && parsed?.kind !== 'mobile' ? t('identity.signIn.phoneInvalid') : undefined;
  const passwordError =
    checking && !first && password === '' ? t('identity.signIn.passwordRequired') : undefined;

  const send = useMutation({
    mutationFn: async (e164: string) => {
      if (first) {
        const { challengeId } = await requestFirstSignIn(e164);
        onOtp(challengeId, e164);
        return;
      }
      const result = await signIn(e164, password, registration);
      if (result.step === 'otp') onOtp(result.challengeId, e164);
      else await onDone(result.ticket, e164);
    },
  });

  function submit(): boolean {
    setChecking(true);
    if (parsed?.kind !== 'mobile' || (!first && password === '')) return false;
    send.mutate(parsed.e164);
    return true;
  }

  const code = apiErrorCode(send.error);
  return (
    <Form onSubmit={submit} busy={send.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <FormFields>
          <Field invalid={phoneError !== undefined} disabled={member !== undefined}>
            <FieldLabel>{t('identity.signIn.phone')}</FieldLabel>
            <Input
              dir="ltr"
              inputMode="tel"
              autoComplete="username"
              autoFocus={member === undefined}
              value={phone}
              onValueChange={setPhone}
            />
            <FieldDescription>{t('identity.signIn.phoneHint')}</FieldDescription>
            <FieldError match={phoneError !== undefined}>{phoneError}</FieldError>
          </Field>
          {!first && (
            <Field invalid={passwordError !== undefined}>
              <FieldLabel>{t('identity.signIn.password')}</FieldLabel>
              <PasswordInput
                autoComplete="current-password"
                autoFocus={member !== undefined}
                value={password}
                onValueChange={setPassword}
                showLabel={t('identity.password.show')}
                hideLabel={t('identity.password.hide')}
              />
              <FieldError match={passwordError !== undefined}>{passwordError}</FieldError>
            </Field>
          )}
        </FormFields>
        <FormActions>
          <Button type="submit" loading={send.isPending} disabled={!online}>
            {first ? t('identity.signIn.sendCode') : t('identity.signIn.submit')}
          </Button>
        </FormActions>
        {send.error && (
          <Callout
            role="alert"
            tone="danger"
            title={errorText(send.error)}
            description={
              code === 'RATE_LIMITED' && !first
                ? t('identity.signIn.lockedHint', { minutes: signInPolicy.lockMinutes })
                : undefined
            }
          />
        )}
        {purpose === 'register' && !first && (
          <p className="text-sm text-muted-foreground">{t('identity.signIn.registerHint')}</p>
        )}
      </Card>
    </Form>
  );
}

/** The six-digit code sent by WhatsApp, with the resend countdown (ADR 0022). */
function OtpStep({
  step,
  onResent,
  onRestart,
  onVerified,
}: {
  step: Extract<Step, { kind: 'otp' }>;
  onResent: (challengeId: string) => void;
  onRestart: () => void;
  onVerified: (verified: Awaited<ReturnType<typeof verifyOtp>>) => Promise<void>;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const online = useOnline();
  const [code, setCode] = useState('');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const wait = Math.max(
    0,
    Math.ceil((step.sentAt + otpPolicy.resendCooldownSeconds * 1000 - now) / 1000),
  );

  const verify = useMutation({
    mutationFn: async (value: string) => onVerified(await verifyOtp(step.challengeId, value)),
    onError: () => setCode(''),
  });
  const resend = useMutation({
    mutationFn: () => resendOtp(step.challengeId),
    onSuccess: ({ challengeId }) => {
      verify.reset();
      onResent(challengeId);
    },
  });
  const failure = apiErrorCode(verify.error);
  const spent = failure === 'OTP_EXPIRED' || failure === 'OTP_ATTEMPTS_EXCEEDED';

  function submit(): boolean {
    if (code.length !== 6) return false;
    verify.mutate(code);
    return true;
  }

  return (
    <Form onSubmit={submit} busy={verify.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <FormFields>
          <CodeField
            label={t('identity.otp.label')}
            // The number is isolated left to right inside the Arabic sentence.
            description={t('identity.otp.sentTo', { phone: `\u2066${step.phone}\u2069` })}
            error={verify.error && !spent ? errorText(verify.error) : undefined}
            value={code}
            onValueChange={setCode}
            onComplete={(value) => !verify.isPending && verify.mutate(value)}
            autoFocus
            disabled={spent}
          />
        </FormFields>
        <FormActions>
          <Button
            type="submit"
            loading={verify.isPending}
            disabled={!online || spent || code.length !== 6}
          >
            {t('identity.otp.verify')}
          </Button>
          <Button
            variant="ghost"
            loading={resend.isPending}
            disabled={!online || wait > 0}
            onClick={() => resend.mutate()}
          >
            {wait > 0 ? t('identity.otp.resendIn', { seconds: wait }) : t('identity.otp.resend')}
          </Button>
        </FormActions>
        {spent && (
          <Callout
            role="alert"
            tone="warning"
            title={errorText(verify.error)}
            action={
              <Button variant="outline" size="sm" onClick={onRestart}>
                {t('identity.otp.restart')}
              </Button>
            }
          />
        )}
        {resend.error && <Callout role="alert" tone="danger" title={errorText(resend.error)} />}
      </Card>
    </Form>
  );
}

/** Rule 11, the hints of screen 2: what makes a password acceptable. */
function passwordHints(password: string, phone: string) {
  return {
    length: password.length >= passwordPolicy.minLength,
    common: password.length > 0 && !isWeakPassword(password, phone),
  };
}

/** First sign-in (rule 15): the person confirms their name and sets a password. */
function FirstPasswordStep({
  step,
  onDone,
}: {
  step: Extract<Step, { kind: 'password' }>;
  onDone: (ticket: string, name: string) => Promise<void>;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const online = useOnline();
  const [name, setName] = useState(step.name);
  const [password, setPassword] = useState('');
  const [checking, setChecking] = useState(false);
  const hints = passwordHints(password, step.phone);
  const nameError =
    checking && name.trim().length < 2 ? t('identity.firstSignIn.nameInvalid') : undefined;
  const passwordError =
    checking && !(hints.length && hints.common) ? t('identity.password.weak') : undefined;

  const save = useMutation({
    mutationFn: async () =>
      onDone(await setFirstPassword(step.ticket, name.trim(), password), name.trim()),
  });

  function submit(): boolean {
    setChecking(true);
    if (name.trim().length < 2 || !(hints.length && hints.common)) return false;
    save.mutate();
    return true;
  }

  return (
    <Form onSubmit={submit} busy={save.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <FormFields>
          <Field invalid={nameError !== undefined}>
            <FieldLabel>{t('identity.firstSignIn.name')}</FieldLabel>
            <Input autoComplete="name" autoFocus value={name} onValueChange={setName} />
            <FieldDescription>{t('identity.firstSignIn.nameHint')}</FieldDescription>
            <FieldError match={nameError !== undefined}>{nameError}</FieldError>
          </Field>
          <Field invalid={passwordError !== undefined}>
            <FieldLabel>{t('identity.firstSignIn.password')}</FieldLabel>
            <PasswordInput
              autoComplete="new-password"
              value={password}
              onValueChange={setPassword}
              showLabel={t('identity.password.show')}
              hideLabel={t('identity.password.hide')}
            />
            <PasswordHints hints={hints} />
            <FieldError match={passwordError !== undefined}>{passwordError}</FieldError>
          </Field>
        </FormFields>
        <FormActions>
          <Button type="submit" loading={save.isPending} disabled={!online}>
            {t('identity.firstSignIn.submit')}
          </Button>
        </FormActions>
        {save.error && <Callout role="alert" tone="danger" title={errorText(save.error)} />}
      </Card>
    </Form>
  );
}

/** The password rules as a checklist that follows the typing. */
export function PasswordHints({ hints }: { hints: { length: boolean; common: boolean } }) {
  const { t } = useTranslation('clinic');
  const items = [
    {
      met: hints.length,
      text: t('identity.password.hintLength', { min: passwordPolicy.minLength }),
    },
    { met: hints.common, text: t('identity.password.hintCommon') },
  ];
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
      {items.map((item) => (
        <li
          key={item.text}
          className={
            item.met
              ? 'flex items-center gap-2 text-foreground'
              : 'flex items-center gap-2 text-muted-foreground'
          }
        >
          {item.met ? (
            <CheckIcon aria-hidden="true" className="size-4 text-primary" />
          ) : (
            <XIcon aria-hidden="true" className="size-4" />
          )}
          <span>
            <span className="sr-only">
              {item.met ? t('identity.password.met') : t('identity.password.notMet')}
            </span>
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

export { passwordHints };
