import { useIsMutating, useMutation } from '@tanstack/react-query';
import { Navigate, useNavigate } from '@tanstack/react-router';
import type { Role } from '@vertex-shifa/contracts';
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@vertex-shifa/ui';
import { ClockAlertIcon, LockKeyholeIcon, PlusIcon, UserRoundPlusIcon } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { apiErrorCode } from '../../lib/api';
import {
  device,
  type InstallationView,
  type MemberView,
  type RegistrationView,
} from '../../lib/device';
import { logErrorLabel } from '../../lib/error-logging';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { CodeField } from './code-fields';
import { currentRegistration, logoSource, useInstallation } from './installation';
import {
  clearLockReason,
  confirmPendingWipes,
  currentLockReason,
  lockApp,
  openSession,
  refreshDevice,
  remember,
  subscribeLockReason,
} from './session';

export type LockSearch = { member?: string };

/** An unlock in progress: the member and the clinic stay as they are until it ends. */
const unlockingKey = ['unlock'];

/**
 * `/lock` (screen 5, rules 22–26): the clinic, its enrolled members and the PIN. Offline the PIN
 * still works within each member's window; signing in, "Forgot PIN" and adding a clinic wait for
 * the connection. Several clinics: the switcher picks one, and switching locks the current one.
 */
export function LockScreen({ search }: { search: LockSearch }) {
  const installation = useInstallation();
  const online = useOnline();
  const view = installation.data;
  const registration = view && currentRegistration(view);

  // Online: wipes the server has not heard of, and the members and windows of this clinic.
  const deviceId = registration?.status === 'active' ? registration.deviceId : undefined;
  useEffect(() => {
    if (!online) return;
    // Once per clinic and connection, from the installation as it is then.
    void (async () => {
      const fresh = await device('view', null);
      await confirmPendingWipes(fresh);
      const active = fresh.registrations.find(
        (item) => item.deviceId === deviceId && item.status === 'active',
      );
      if (active) await refreshDevice(active);
    })().catch(logErrorLabel);
  }, [online, deviceId]);

  if (!view) return null;
  if (!registration) return <Navigate to="/welcome" replace />;
  return (
    <LockView
      key={registration.deviceId}
      view={view}
      registration={registration}
      initialMember={search.member}
    />
  );
}

function LockView({
  view,
  registration,
  initialMember,
}: {
  view: InstallationView;
  registration: RegistrationView;
  initialMember: string | undefined;
}) {
  const { t } = useTranslation(['clinic', 'errors']);
  const online = useOnline();
  const navigate = useNavigate();
  const reason = useSyncExternalStore(subscribeLockReason, currentLockReason);
  const unlocking = useIsMutating({ mutationKey: unlockingKey }) > 0;
  const members = registration.members;
  const [selected, setSelected] = useState(
    initialMember ?? (members.length === 1 ? members[0]?.enrollmentId : undefined),
  );
  const member = members.find((item) => item.enrollmentId === selected);

  const select = useMutation({
    mutationFn: async (deviceId: string) => remember(await device('select', { deviceId })),
  });

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <header className="flex items-center gap-4">
        <Avatar
          name={registration.clinicName}
          src={logoSource(registration)}
          size="lg"
          shape="square"
        />
        <div className="flex min-w-0 flex-col">
          <h1 className="text-2xl font-bold">{registration.clinicName}</h1>
          {registration.facilityName && (
            <p className="text-muted-foreground">{registration.facilityName}</p>
          )}
        </div>
      </header>

      {view.registrations.length > 1 && (
        <Field className="max-w-sm">
          <FieldLabel>{t('identity.lock.clinic')}</FieldLabel>
          <Select
            value={registration.deviceId}
            disabled={unlocking}
            onValueChange={(deviceId) => deviceId && select.mutate(deviceId)}
            items={view.registrations.map((item) => ({
              value: item.deviceId,
              label: item.clinicName,
            }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {view.registrations.map((item) => (
                <SelectItem key={item.deviceId} value={item.deviceId}>
                  {item.clinicName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <OfflineNotice description={t('identity.offline.lock')} />
      {view.clockBehind && (
        <Callout
          role="status"
          tone="warning"
          icon={<ClockAlertIcon aria-hidden />}
          title={t('identity.lock.clockTitle')}
          description={t('identity.lock.clockDescription')}
        />
      )}
      {reason && registration.status === 'active' && (
        <Callout role="status" tone="warning" title={t(`errors:${reason}`)} />
      )}

      {registration.status === 'wiped' ? (
        <WipedNotice registration={registration} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('identity.lock.title')}</CardTitle>
            <CardDescription>
              {members.length > 0 ? t('identity.lock.description') : t('identity.lock.noMembers')}
            </CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-6 px-4 pb-4">
            {members.length > 0 && (
              <ul aria-label={t('identity.lock.members')} className="grid gap-2 sm:grid-cols-2">
                {members.map((item) => (
                  <li key={item.enrollmentId}>
                    <MemberButton
                      member={item}
                      selected={item.enrollmentId === selected}
                      disabled={unlocking}
                      onSelect={() => setSelected(item.enrollmentId)}
                    />
                  </li>
                ))}
              </ul>
            )}
            {member && (
              <PinPanel key={member.enrollmentId} registration={registration} member={member} />
            )}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {registration.status === 'active' && (
          <Button
            variant="outline"
            disabled={!online || unlocking}
            onClick={() => void navigate({ to: '/sign-in', search: { purpose: 'enroll' } })}
          >
            <UserRoundPlusIcon aria-hidden />
            {t('identity.lock.anotherUser')}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={!online || unlocking}
          onClick={() => void navigate({ to: '/sign-in', search: { purpose: 'register' } })}
        >
          <PlusIcon aria-hidden />
          {t('identity.lock.addClinic')}
        </Button>
      </div>
    </section>
  );
}

export function useRoleNames(): (roles: readonly Role[]) => string {
  const { t } = useTranslation('clinic');
  return (roles) => roles.map((role) => t(`roles.${role}`)).join(t('roles.separator'));
}

function MemberButton({
  member,
  selected,
  disabled,
  onSelect,
}: {
  member: MemberView;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation('clinic');
  const online = useOnline();
  const roleNames = useRoleNames();
  const name = member.name || t('identity.lock.unnamed');
  return (
    <Button
      variant={selected ? 'secondary' : 'outline'}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
      className="h-auto w-full justify-start gap-3 py-3 text-start whitespace-normal"
    >
      <Avatar name={name} size="md" />
      <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span className="font-medium">{name}</span>
        {member.roles.length > 0 && (
          <span className="text-sm font-normal text-muted-foreground">
            {roleNames(member.roles)}
          </span>
        )}
        {member.pinDisabled ? (
          <Badge tone="danger">{t('identity.lock.pinDisabledBadge')}</Badge>
        ) : (
          !member.windowOpen &&
          !online && <Badge tone="warning">{t('identity.lock.windowExpiredBadge')}</Badge>
        )}
      </span>
    </Button>
  );
}

/** The PIN of the chosen member, or why it cannot be used now. */
function PinPanel({
  registration,
  member,
}: {
  registration: RegistrationView;
  member: MemberView;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const online = useOnline();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string>();
  const [expired, setExpired] = useState(false);
  const blocked = !online && !member.windowOpen;

  const unlock = useMutation({
    mutationKey: unlockingKey,
    mutationFn: async (value: string) => {
      const result = await device('unlock', {
        deviceId: registration.deviceId,
        enrollmentId: member.enrollmentId,
        pin: value,
      });
      if (result.result !== 'unlocked') {
        remember(await device('view', null));
        if (result.result === 'wrong_pin') {
          setError(t('identity.lock.wrongPin', { remaining: result.attemptsLeft }));
        }
        return;
      }
      // Rule 23: online, a session confirms the member again; rule 24: offline only in the window.
      try {
        await openSession({
          deviceId: registration.deviceId,
          tenantId: registration.tenantId,
          enrollmentId: member.enrollmentId,
        });
      } catch (failure) {
        if (!result.windowOpen) {
          // Outside the window nothing but a session lets the member in.
          await lockApp();
          if (apiErrorCode(failure) === 'NETWORK_ERROR') setExpired(true);
          else setError(errorText(failure));
          return;
        }
        // A refusal has locked the app with its reason; a server out of reach leaves the window.
        if (apiErrorCode(failure) !== 'NETWORK_ERROR' && !(await device('view', null)).unlocked) {
          return;
        }
      }
      clearLockReason();
      remember(await device('view', null));
      await navigate({ to: '/', replace: true });
    },
    onSettled: () => setPin(''),
  });

  if (member.pinDisabled) {
    return (
      <Callout
        role="status"
        tone="danger"
        icon={<LockKeyholeIcon aria-hidden />}
        title={t('identity.lock.pinDisabledTitle')}
        description={
          online ? t('identity.lock.pinDisabledDescription') : t('identity.lock.pinDisabledOffline')
        }
        action={
          <Button
            size="sm"
            disabled={!online}
            onClick={() =>
              void navigate({
                to: '/sign-in',
                search: { purpose: 'reenable', member: member.enrollmentId },
              })
            }
          >
            {t('identity.lock.signInWithPassword')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(blocked || expired) && (
        <Callout
          role="status"
          tone="warning"
          title={t('identity.lock.windowExpiredTitle')}
          description={t('identity.lock.windowExpiredDescription')}
        />
      )}
      <CodeField
        mask
        autoFocus
        label={t('identity.lock.pin', { name: member.name || t('identity.lock.unnamed') })}
        error={error}
        value={pin}
        onValueChange={(value) => {
          setPin(value);
          setError(undefined);
        }}
        onComplete={(value) => !unlock.isPending && unlock.mutate(value)}
        disabled={blocked || unlock.isPending}
      />
      <div>
        <Button
          variant="link"
          className="px-0"
          disabled={!online}
          onClick={() =>
            void navigate({
              to: '/sign-in',
              search: { purpose: 'forgot', member: member.enrollmentId },
            })
          }
        >
          {t('identity.lock.forgotPin')}
        </Button>
      </div>
    </div>
  );
}

/** Rule 29: this computer was removed from the clinic, and its data here was deleted. */
function WipedNotice({ registration }: { registration: RegistrationView }) {
  const { t } = useTranslation('clinic');
  const dismiss = useMutation({
    mutationFn: async () =>
      remember(await device('dismissWiped', { deviceId: registration.deviceId })),
  });
  return (
    <Callout
      role="alert"
      tone="danger"
      title={t('identity.lock.wipedTitle', { clinic: registration.clinicName })}
      description={
        registration.wipePending
          ? t('identity.lock.wipedPending')
          : t('identity.lock.wipedDescription')
      }
      action={
        !registration.wipePending && (
          <Button
            size="sm"
            variant="outline"
            loading={dismiss.isPending}
            onClick={() => dismiss.mutate()}
          >
            {t('identity.lock.wipedDismiss')}
          </Button>
        )
      }
    />
  );
}
