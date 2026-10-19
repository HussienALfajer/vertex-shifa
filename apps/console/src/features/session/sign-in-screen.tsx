import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  type ConsoleSetUp,
  parsePhoneNumber,
  recoveryCodeSchema,
  setupCodeSchema,
  signInPolicy,
} from '@vertex-shifa/contracts';
import {
  Button,
  Callout,
  Card,
  CardDescription,
  CardTitle,
  Checkbox,
  CodeField,
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
  QrCode,
  Stepper,
  toast,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { apiErrorCode } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { PasswordHints, passwordHints } from './password-hints';
import { signedIn } from './session';
import { setUp, signIn, verifyTotp } from './sign-in-api';

type Mode = 'password' | 'setupCode';

type SetupStep = {
  kind: 'setup';
  ticket: string;
  phone: string;
  totpSecret: string;
  totpUri: string;
  stage: 'password' | 'authenticator';
  password: string;
  /** The API found the password weak after all: shown on the password stage. */
  passwordRefused: boolean;
};

type Step =
  | { kind: 'credentials'; mode: Mode }
  | { kind: 'totp'; ticket: string }
  | SetupStep
  | { kind: 'recoveryCodes'; codes: string[] };

/**
 * `/sign-in` (screen 12, rules 36–37): phone and password, then a TOTP code or a recovery code. A
 * new or reset user signs in with the setup code instead, chooses a password, adds the console to
 * an authenticator app, confirms it with a code and sees the ten recovery codes once.
 */
export function SignInScreen({ ended }: { ended: boolean }) {
  const { t } = useTranslation('console');
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>({ kind: 'credentials', mode: 'password' });
  const [expired, setExpired] = useState(false);
  const restart = (mode: Mode) => {
    setExpired(true);
    setStep({ kind: 'credentials', mode });
  };
  const toConsole = () => navigate({ to: '/', replace: true });

  const setup = step.kind === 'setup' || step.kind === 'recoveryCodes';
  const stages = [
    t('setup.steps.password'),
    t('setup.steps.authenticator'),
    t('setup.steps.recoveryCodes'),
  ];
  const credentialsTitle =
    step.kind === 'credentials' && step.mode === 'setupCode'
      ? { title: t('signIn.setupTitle'), description: t('signIn.setupDescription') }
      : { title: t('signIn.title'), description: t('signIn.description') };
  const header = setup
    ? { title: t('setup.title'), description: t('setup.description') }
    : step.kind === 'totp'
      ? { title: t('totp.title'), description: t('totp.description') }
      : credentialsTitle;

  return (
    <section className="flex max-w-xl flex-col gap-6">
      <PageHeader title={header.title} description={header.description} />
      {setup && (
        <Stepper
          aria-label={t('setup.title')}
          steps={stages}
          current={step.kind === 'recoveryCodes' ? 2 : step.stage === 'authenticator' ? 1 : 0}
          onSelect={
            step.kind === 'setup' && step.stage === 'authenticator'
              ? () => setStep({ ...step, stage: 'password' })
              : undefined
          }
        />
      )}
      <OfflineNotice />
      {step.kind === 'credentials' && (
        <CredentialsStep
          key={step.mode}
          mode={step.mode}
          notice={
            expired
              ? { title: t('signIn.ticketExpired') }
              : ended
                ? { title: t('session.ended'), description: t('session.endedHint') }
                : undefined
          }
          onMode={(mode) => {
            setExpired(false);
            setStep({ kind: 'credentials', mode });
          }}
          onNext={(result, phone) => {
            setExpired(false);
            if (result.step === 'totp') setStep({ kind: 'totp', ticket: result.ticket });
            else
              setStep({
                kind: 'setup',
                ticket: result.ticket,
                phone,
                totpSecret: result.totpSecret,
                totpUri: result.totpUri,
                stage: 'password',
                password: '',
                passwordRefused: false,
              });
          }}
        />
      )}
      {step.kind === 'totp' && (
        <TotpStep ticket={step.ticket} onExpired={() => restart('password')} onDone={toConsole} />
      )}
      {step.kind === 'setup' && step.stage === 'password' && (
        <SetupPasswordStep
          step={step}
          onNext={(password) =>
            setStep({ ...step, stage: 'authenticator', password, passwordRefused: false })
          }
        />
      )}
      {step.kind === 'setup' && step.stage === 'authenticator' && (
        <AuthenticatorStep
          step={step}
          onExpired={() => restart('setupCode')}
          onWeakPassword={() => setStep({ ...step, stage: 'password', passwordRefused: true })}
          onDone={(codes) => setStep({ kind: 'recoveryCodes', codes })}
        />
      )}
      {step.kind === 'recoveryCodes' && (
        <RecoveryCodesStep codes={step.codes} onContinue={toConsole} />
      )}
    </section>
  );
}

type SignInResult = Awaited<ReturnType<typeof signIn>>;

/** Phone with the password, or with the one-time setup code (rule 36). */
function CredentialsStep({
  mode,
  notice,
  onMode,
  onNext,
}: {
  mode: Mode;
  notice: { title: string; description?: string } | undefined;
  onMode: (mode: Mode) => void;
  onNext: (result: SignInResult, phone: string) => void;
}) {
  const { t } = useTranslation('console');
  const errorText = useErrorText();
  const online = useOnline();
  const [phone, setPhone] = useState('');
  const [secret, setSecret] = useState('');
  const [checking, setChecking] = useState(false);
  const parsed = parsePhoneNumber(phone);
  const setupCode = setupCodeSchema.safeParse(secret);
  const phoneError = checking && parsed?.kind !== 'mobile' ? t('signIn.phoneInvalid') : undefined;
  const secretError = !checking
    ? undefined
    : mode === 'password'
      ? secret === ''
        ? t('signIn.passwordRequired')
        : undefined
      : setupCode.success
        ? undefined
        : t('signIn.setupCodeInvalid');

  const send = useMutation({
    // The answer may hold the new TOTP secret: never kept once the step is gone.
    gcTime: 0,
    mutationFn: (e164: string) =>
      signIn(
        mode === 'password'
          ? { phone: e164, password: secret }
          : { phone: e164, setupCode: setupCodeSchema.parse(secret) },
      ),
    onSuccess: (result, e164) => onNext(result, e164),
  });

  function submit(): boolean {
    setChecking(true);
    if (parsed?.kind !== 'mobile' || secretError !== undefined) return false;
    if (mode === 'password' ? secret === '' : !setupCode.success) return false;
    send.mutate(parsed.e164);
    return true;
  }

  return (
    <Form onSubmit={submit} busy={send.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        {notice && !send.error && <Callout role="status" tone="warning" {...notice} />}
        <FormFields>
          <Field invalid={phoneError !== undefined}>
            <FieldLabel>{t('signIn.phone')}</FieldLabel>
            <Input
              dir="ltr"
              inputMode="tel"
              autoComplete="username"
              autoFocus
              value={phone}
              onValueChange={setPhone}
            />
            <FieldDescription>{t('signIn.phoneHint')}</FieldDescription>
            <FieldError match={phoneError !== undefined}>{phoneError}</FieldError>
          </Field>
          {mode === 'password' ? (
            <Field invalid={secretError !== undefined}>
              <FieldLabel>{t('signIn.password')}</FieldLabel>
              <PasswordInput
                autoComplete="current-password"
                value={secret}
                onValueChange={setSecret}
                showLabel={t('password.show')}
                hideLabel={t('password.hide')}
              />
              <FieldError match={secretError !== undefined}>{secretError}</FieldError>
            </Field>
          ) : (
            <Field invalid={secretError !== undefined}>
              <FieldLabel>{t('signIn.setupCode')}</FieldLabel>
              <Input
                dir="ltr"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                value={secret}
                onValueChange={setSecret}
              />
              <FieldDescription>{t('signIn.setupCodeHint')}</FieldDescription>
              <FieldError match={secretError !== undefined}>{secretError}</FieldError>
            </Field>
          )}
        </FormFields>
        <FormActions>
          <Button type="submit" loading={send.isPending} disabled={!online}>
            {t('signIn.submit')}
          </Button>
        </FormActions>
        {send.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('signIn.working')}
          </p>
        )}
        {send.error && (
          <Callout
            role="alert"
            tone="danger"
            title={errorText(send.error)}
            description={
              apiErrorCode(send.error) === 'RATE_LIMITED'
                ? t('signIn.lockedHint', { minutes: signInPolicy.lockMinutes })
                : undefined
            }
          />
        )}
      </Card>
      <p className="mt-4 text-sm">
        <Button
          variant="link"
          className="h-auto p-0"
          disabled={send.isPending}
          onClick={() => onMode(mode === 'password' ? 'setupCode' : 'password')}
        >
          {mode === 'password' ? t('signIn.withSetupCode') : t('signIn.withPassword')}
        </Button>
      </p>
    </Form>
  );
}

/** Rule 37: the authenticator's code, or one of the ten recovery codes. */
function TotpStep({
  ticket,
  onExpired,
  onDone,
}: {
  ticket: string;
  onExpired: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation('console');
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const online = useOnline();
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [checking, setChecking] = useState(false);
  const recoveryCode = recoveryCodeSchema.safeParse(code);
  const recoveryError =
    recovery && checking && !recoveryCode.success ? t('totp.recoveryInvalid') : undefined;

  const verify = useMutation({
    mutationFn: (value: string) => verifyTotp(ticket, value),
    onSuccess: (me) => {
      signedIn(queryClient, me);
      onDone();
    },
    onError: (error) => {
      if (apiErrorCode(error) === 'TICKET_INVALID') onExpired();
      else if (!recovery) setCode('');
    },
  });

  function submit(): boolean {
    setChecking(true);
    if (recovery) {
      if (!recoveryCode.success) return false;
      verify.mutate(recoveryCode.data);
      return true;
    }
    if (code.length !== 6) return false;
    verify.mutate(code);
    return true;
  }

  return (
    <Form onSubmit={submit} busy={verify.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <FormFields>
          {recovery ? (
            <Field invalid={recoveryError !== undefined || verify.isError}>
              <FieldLabel>{t('totp.recoveryLabel')}</FieldLabel>
              <Input
                dir="ltr"
                autoComplete="one-time-code"
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                value={code}
                onValueChange={setCode}
              />
              <FieldDescription>{t('totp.recoveryHint')}</FieldDescription>
              <FieldError match={recoveryError !== undefined || verify.isError}>
                {recoveryError ?? errorText(verify.error)}
              </FieldError>
            </Field>
          ) : (
            <CodeField
              label={t('totp.label')}
              slotLabel={(position) => t('code.digit', { position })}
              error={verify.error ? errorText(verify.error) : undefined}
              value={code}
              onValueChange={setCode}
              onComplete={(value) => !verify.isPending && verify.mutate(value)}
              autoFocus
            />
          )}
        </FormFields>
        <FormActions>
          <Button
            type="submit"
            loading={verify.isPending}
            disabled={!online || (!recovery && code.length !== 6)}
          >
            {t('totp.verify')}
          </Button>
          <Button
            variant="ghost"
            disabled={verify.isPending}
            onClick={() => {
              setRecovery(!recovery);
              setCode('');
              setChecking(false);
              verify.reset();
            }}
          >
            {recovery ? t('totp.useTotp') : t('totp.useRecoveryCode')}
          </Button>
        </FormActions>
        {recovery && <p className="text-sm text-muted-foreground">{t('totp.recoveryNoReauth')}</p>}
        {apiErrorCode(verify.error) === 'RATE_LIMITED' && (
          <Callout
            role="alert"
            tone="danger"
            title={errorText(verify.error)}
            description={t('signIn.lockedHint', { minutes: signInPolicy.lockMinutes })}
          />
        )}
      </Card>
    </Form>
  );
}

/** Setup, first stage: the password, checked here as the API will (rule 11). */
function SetupPasswordStep({
  step,
  onNext,
}: {
  step: SetupStep;
  onNext: (password: string) => void;
}) {
  const { t } = useTranslation(['console', 'errors']);
  const [password, setPassword] = useState(step.password);
  const [checking, setChecking] = useState(step.passwordRefused);
  const hints = passwordHints(password, step.phone);
  const refused = step.passwordRefused && password === step.password;
  const error = refused
    ? t('errors:PASSWORD_TOO_WEAK')
    : checking && !(hints.length && hints.common)
      ? t('password.weak')
      : undefined;

  function submit(): boolean {
    setChecking(true);
    if (refused || !(hints.length && hints.common)) return false;
    onNext(password);
    return true;
  }

  return (
    <Form onSubmit={submit}>
      <Card className="flex flex-col gap-6 p-6">
        <FormFields>
          <Field invalid={error !== undefined}>
            <FieldLabel>{t('setup.newPassword')}</FieldLabel>
            <PasswordInput
              autoComplete="new-password"
              autoFocus
              value={password}
              onValueChange={setPassword}
              showLabel={t('password.show')}
              hideLabel={t('password.hide')}
            />
            <PasswordHints hints={hints} />
            <FieldError match={error !== undefined}>{error}</FieldError>
          </Field>
        </FormFields>
        <FormActions>
          <Button type="submit">{t('setup.next')}</Button>
        </FormActions>
      </Card>
    </Form>
  );
}

/** The secret in groups of four, as authenticator apps show it. */
function grouped(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(' ') ?? secret;
}

/** Setup, second stage: the QR code of the new secret and a code that proves it was added. */
function AuthenticatorStep({
  step,
  onExpired,
  onWeakPassword,
  onDone,
}: {
  step: SetupStep;
  onExpired: () => void;
  onWeakPassword: () => void;
  onDone: (codes: string[]) => void;
}) {
  const { t } = useTranslation('console');
  const queryClient = useQueryClient();
  const errorText = useErrorText();
  const online = useOnline();
  const [code, setCode] = useState('');

  const confirm = useMutation({
    // The answer holds the recovery codes, shown once (rule 37).
    gcTime: 0,
    mutationFn: (value: string) => setUp(step.ticket, step.password, value),
    onSuccess: (result: ConsoleSetUp) => {
      signedIn(queryClient, result);
      onDone(result.recoveryCodes);
    },
    onError: (error) => {
      const failure = apiErrorCode(error);
      if (failure === 'TICKET_INVALID') onExpired();
      else if (failure === 'PASSWORD_TOO_WEAK') onWeakPassword();
      else setCode('');
    },
  });

  function submit(): boolean {
    if (code.length !== 6) return false;
    confirm.mutate(code);
    return true;
  }

  return (
    <Form onSubmit={submit} busy={confirm.isPending}>
      <Card className="flex flex-col gap-6 p-6">
        <div className="flex flex-col gap-1">
          <CardTitle>{t('setup.scanTitle')}</CardTitle>
          <CardDescription>{t('setup.scanDescription')}</CardDescription>
        </div>
        <div className="flex flex-col items-start gap-3">
          <QrCode value={step.totpUri} label={t('setup.qrLabel')} />
          <p className="text-sm text-muted-foreground">{t('setup.manualKey')}</p>
          <bdi dir="ltr" className="text-lg font-medium tabular-nums select-all">
            {grouped(step.totpSecret)}
          </bdi>
        </div>
        <FormFields>
          <CodeField
            label={t('setup.confirmLabel')}
            slotLabel={(position) => t('code.digit', { position })}
            error={confirm.error ? errorText(confirm.error) : undefined}
            value={code}
            onValueChange={setCode}
            onComplete={(value) => !confirm.isPending && confirm.mutate(value)}
          />
        </FormFields>
        <FormActions>
          <Button type="submit" loading={confirm.isPending} disabled={!online || code.length !== 6}>
            {t('setup.confirm')}
          </Button>
        </FormActions>
      </Card>
    </Form>
  );
}

/** Setup, last stage: the ten recovery codes, shown this once (rule 37). */
function RecoveryCodesStep({ codes, onContinue }: { codes: string[]; onContinue: () => void }) {
  const { t } = useTranslation('console');
  const [saved, setSaved] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      toast.add({ title: t('recoveryCodes.copied'), type: 'success' });
    } catch {
      toast.add({ title: t('recoveryCodes.copyFailed'), type: 'error' });
    }
  }

  return (
    <Card className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <CardTitle>{t('recoveryCodes.title')}</CardTitle>
        <CardDescription>{t('recoveryCodes.description')}</CardDescription>
      </div>
      <ul
        aria-label={t('recoveryCodes.listLabel')}
        dir="ltr"
        className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-md border border-border p-4 text-lg font-medium tabular-nums"
      >
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div>
        <Button variant="outline" onClick={() => void copy()}>
          {t('recoveryCodes.copy')}
        </Button>
      </div>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: the checkbox inside is the control. */}
      <label className="flex w-fit items-center gap-2 text-base">
        <Checkbox checked={saved} onCheckedChange={setSaved} />
        {t('recoveryCodes.saved')}
      </label>
      <div>
        <Button disabled={!saved} onClick={onContinue}>
          {t('recoveryCodes.continue')}
        </Button>
      </div>
    </Card>
  );
}
