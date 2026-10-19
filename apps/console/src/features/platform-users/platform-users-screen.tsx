import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type PlatformRole,
  type PlatformUser,
  type PlatformUserSetup,
  parsePhoneNumber,
  platformRoleSchema,
  platformUserNameSchema,
} from '@vertex-shifa/contracts';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Callout,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormFields,
  Input,
  PageHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@vertex-shifa/ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { QueryStates } from '../../components/query-states';
import { StateCard } from '../../components/state-card';
import { useErrorText } from '../../lib/error-text';
import { formatDateTime } from '../../lib/format';
import { useOnline } from '../../lib/online';
import { useReauth } from '../session/reauth';
import { holds, meQuery } from '../session/session';
import {
  createPlatformUser,
  platformUsersQuery,
  resetPlatformUser,
  updatePlatformUser,
  usePlatformUsersCache,
} from './queries';

const roles = platformRoleSchema.options;

/**
 * `/platform-users` (screen 14, rules 36 and 40), admins only: Vertex staff in the console; add a
 * user (setup code shown once), change a role, disable or enable, reset the sign-in. Every change
 * asks for a TOTP first (rule 38). An admin cannot change themselves; the API keeps the last admin.
 */
export function PlatformUsersScreen() {
  const { t } = useTranslation('console');
  const me = useQuery(meQuery);
  const admin = holds(me.data, 'platform-users.manage');
  const users = useQuery({ ...platformUsersQuery, enabled: admin });
  const online = useOnline();
  const [setup, setSetup] = useState<PlatformUserSetup>();
  if (me.data && !admin) {
    return (
      <StateCard
        role="status"
        title={t('states.noAccessTitle')}
        description={t('states.noAccessDescription')}
      />
    );
  }
  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <PageHeader
        title={t('platformUsers.title')}
        description={t('platformUsers.description')}
        actions={<CreateDialog disabled={!online} onCreated={setSetup} />}
      />
      <OfflineNotice />
      <QueryStates queries={[me, users]}>
        {() =>
          users.data?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('platformUsers.name')}</TableHead>
                  <TableHead>{t('platformUsers.phone')}</TableHead>
                  <TableHead>{t('platformUsers.role')}</TableHead>
                  <TableHead>{t('platformUsers.status')}</TableHead>
                  <TableHead>{t('platformUsers.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    self={user.id === me.data?.id}
                    disabled={!online}
                    onReset={setSetup}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              title={t('platformUsers.empty.title')}
              description={t('platformUsers.empty.description')}
            />
          )
        }
      </QueryStates>
      <SetupCodeDialog setup={setup} onClose={() => setSetup(undefined)} />
    </section>
  );
}

function UserRow({
  user,
  self,
  disabled,
  onReset,
}: {
  user: PlatformUser;
  self: boolean;
  disabled: boolean;
  onReset: (setup: PlatformUserSetup) => void;
}) {
  const { t } = useTranslation('console');
  const tone = { pending_setup: 'warning', active: 'success', disabled: 'neutral' } as const;
  const expires = user.setupCodeExpiresAt;
  return (
    <TableRow>
      <TableCell className="font-medium">
        <span className="flex flex-wrap items-center gap-2">
          {user.name}
          {self && <Badge tone="brand">{t('platformUsers.you')}</Badge>}
        </span>
      </TableCell>
      <TableCell>
        <bdi dir="ltr">{user.phone}</bdi>
      </TableCell>
      <TableCell>{t(`roles.${user.role}`)}</TableCell>
      <TableCell>
        <span className="flex flex-col items-start gap-1">
          <Badge tone={tone[user.status]}>{t(`platformUsers.statuses.${user.status}`)}</Badge>
          {user.status === 'pending_setup' && expires && (
            <span className="text-sm text-muted-foreground">
              {Date.parse(expires) > Date.now()
                ? t('platformUsers.setupUntil', { date: formatDateTime(expires) })
                : t('platformUsers.setupExpired')}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        {/* Rule 40: an admin never demotes, disables or resets themselves. */}
        {!self && (
          <span className="flex flex-wrap gap-2">
            {user.status !== 'disabled' && <RoleDialog user={user} disabled={disabled} />}
            <StatusAction user={user} disabled={disabled} />
            {user.status !== 'disabled' && (
              <ResetAction user={user} disabled={disabled} onReset={onReset} />
            )}
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

/** A dialog holding a small form: reset each time it opens, kept open while its save runs. */
function FormDialog({
  trigger,
  title,
  description,
  busy,
  onOpen,
  open,
  setOpen,
  onSubmit,
  footer,
  children,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  busy: boolean;
  onOpen: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  onSubmit: () => boolean;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) onOpen();
        setOpen(next);
      }}
    >
      {trigger}
      <DialogContent>
        <Form onSubmit={onSubmit} busy={busy} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>{footer}</DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function RoleChoice({
  value,
  onChange,
}: {
  value: PlatformRole;
  onChange: (role: PlatformRole) => void;
}) {
  const { t } = useTranslation('console');
  return (
    <Field>
      <FieldLabel render={<span />}>{t('platformUsers.role')}</FieldLabel>
      <ToggleGroup
        aria-label={t('platformUsers.role')}
        value={[value]}
        onValueChange={([next]) => next && onChange(next as PlatformRole)}
      >
        {roles.map((role) => (
          <ToggleGroupItem key={role} value={role}>
            {t(`roles.${role}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <FieldDescription>{t(`roleDescriptions.${value}`)}</FieldDescription>
    </Field>
  );
}

function CreateDialog({
  disabled,
  onCreated,
}: {
  disabled: boolean;
  onCreated: (setup: PlatformUserSetup) => void;
}) {
  const { t } = useTranslation('console');
  const errorText = useErrorText();
  const withReauth = useReauth();
  const changed = usePlatformUsersCache();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<PlatformRole>('support');
  const [checking, setChecking] = useState(false);
  const parsed = parsePhoneNumber(phone);
  const phoneError = checking && parsed?.kind !== 'mobile' ? t('signIn.phoneInvalid') : undefined;
  const nameError =
    checking && !platformUserNameSchema.safeParse(name).success
      ? t('platformUsers.createDialog.nameInvalid')
      : undefined;

  const create = useMutation({
    mutationFn: (e164: string) =>
      withReauth(() => createPlatformUser({ phone: e164, name: name.trim(), role })),
    onSuccess: async (setup) => {
      setOpen(false);
      onCreated(setup);
      await changed(setup.user);
    },
  });

  return (
    <FormDialog
      trigger={
        <Button disabled={disabled} onClick={() => setOpen(true)}>
          {t('platformUsers.create')}
        </Button>
      }
      title={t('platformUsers.createDialog.title')}
      description={t('platformUsers.createDialog.description')}
      busy={create.isPending}
      open={open}
      setOpen={setOpen}
      onOpen={() => {
        setPhone('');
        setName('');
        setRole('support');
        setChecking(false);
        create.reset();
      }}
      onSubmit={() => {
        setChecking(true);
        if (parsed?.kind !== 'mobile' || !platformUserNameSchema.safeParse(name).success) {
          return false;
        }
        create.mutate(parsed.e164);
        return true;
      }}
      footer={
        <>
          <DialogClose render={<Button variant="outline" disabled={create.isPending} />}>
            {t('platformUsers.back')}
          </DialogClose>
          <Button type="submit" loading={create.isPending}>
            {t('platformUsers.createDialog.submit')}
          </Button>
        </>
      }
    >
      <FormFields>
        <Field invalid={nameError !== undefined}>
          <FieldLabel>{t('platformUsers.name')}</FieldLabel>
          <Input autoComplete="off" value={name} onValueChange={setName} maxLength={100} />
          <FieldError match={nameError !== undefined}>{nameError}</FieldError>
        </Field>
        <Field invalid={phoneError !== undefined}>
          <FieldLabel>{t('platformUsers.phone')}</FieldLabel>
          <Input
            dir="ltr"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onValueChange={setPhone}
          />
          <FieldDescription>{t('signIn.phoneHint')}</FieldDescription>
          <FieldError match={phoneError !== undefined}>{phoneError}</FieldError>
        </Field>
        <RoleChoice value={role} onChange={setRole} />
      </FormFields>
      {create.error && <Callout role="alert" tone="danger" title={errorText(create.error)} />}
    </FormDialog>
  );
}

function RoleDialog({ user, disabled }: { user: PlatformUser; disabled: boolean }) {
  const { t } = useTranslation('console');
  const errorText = useErrorText();
  const withReauth = useReauth();
  const changed = usePlatformUsersCache();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<PlatformRole>(user.role);

  const save = useMutation({
    mutationFn: (next: PlatformRole) =>
      withReauth(() => updatePlatformUser(user.id, { role: next })),
    onSuccess: async (saved) => {
      setOpen(false);
      toast.add({ title: t('platformUsers.roleChanged'), type: 'success' });
      await changed(saved);
    },
  });

  return (
    <FormDialog
      trigger={
        <Button variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          {t('platformUsers.changeRole')}
        </Button>
      }
      title={t('platformUsers.roleDialog.title', { name: user.name })}
      busy={save.isPending}
      open={open}
      setOpen={setOpen}
      onOpen={() => {
        setRole(user.role);
        save.reset();
      }}
      onSubmit={() => {
        save.mutate(role);
        return true;
      }}
      footer={
        <>
          <DialogClose render={<Button variant="outline" disabled={save.isPending} />}>
            {t('platformUsers.back')}
          </DialogClose>
          <Button type="submit" loading={save.isPending} disabled={role === user.role}>
            {t('platformUsers.roleDialog.submit')}
          </Button>
        </>
      }
    >
      <FormFields>
        <RoleChoice value={role} onChange={setRole} />
      </FormFields>
      {save.error && <Callout role="alert" tone="danger" title={errorText(save.error)} />}
    </FormDialog>
  );
}

/** Disabling ends the user's sessions (asks first); enabling gives the sign-in back. */
function StatusAction({ user, disabled }: { user: PlatformUser; disabled: boolean }) {
  const { t } = useTranslation('console');
  const errorText = useErrorText();
  const withReauth = useReauth();
  const changed = usePlatformUsersCache();
  const enabling = user.status === 'disabled';
  const change = useMutation({
    mutationFn: () => withReauth(() => updatePlatformUser(user.id, { disabled: !enabling })),
    onSuccess: async (saved) => {
      toast.add({
        title: enabling ? t('platformUsers.enabled') : t('platformUsers.disabled'),
        type: 'success',
      });
      await changed(saved);
    },
    onError: (error) => toast.add({ title: errorText(error), type: 'error' }),
  });
  if (enabling) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        loading={change.isPending}
        onClick={() => change.mutate()}
      >
        {t('platformUsers.enable')}
      </Button>
    );
  }
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} loading={change.isPending} />
        }
      >
        {t('platformUsers.disable')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('platformUsers.disableDialog.title', { name: user.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('platformUsers.disableDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t('platformUsers.back')}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => change.mutate()}
          >
            {t('platformUsers.disableDialog.confirm')}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Rule 40: a lost TOTP or password is reset by another admin; a new setup code follows. */
function ResetAction({
  user,
  disabled,
  onReset,
}: {
  user: PlatformUser;
  disabled: boolean;
  onReset: (setup: PlatformUserSetup) => void;
}) {
  const { t } = useTranslation('console');
  const errorText = useErrorText();
  const withReauth = useReauth();
  const changed = usePlatformUsersCache();
  const reset = useMutation({
    mutationFn: () => withReauth(() => resetPlatformUser(user.id)),
    onSuccess: async (setup) => {
      onReset(setup);
      await changed(setup.user);
    },
    onError: (error) => toast.add({ title: errorText(error), type: 'error' }),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" disabled={disabled} loading={reset.isPending} />}
      >
        {t('platformUsers.reset')}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('platformUsers.resetDialog.title', { name: user.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('platformUsers.resetDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t('platformUsers.back')}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => reset.mutate()}
          >
            {t('platformUsers.resetDialog.confirm')}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Rule 36: the one-time setup code, shown to the admin this once to hand over in person. */
function SetupCodeDialog({
  setup,
  onClose,
}: {
  setup: PlatformUserSetup | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation('console');

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.add({ title: t('platformUsers.setupCodeDialog.copied'), type: 'success' });
    } catch {
      toast.add({ title: t('recoveryCodes.copyFailed'), type: 'error' });
    }
  }

  return (
    <Dialog open={setup !== undefined} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        {setup && (
          <>
            <DialogHeader>
              <DialogTitle>
                {t('platformUsers.setupCodeDialog.title', { name: setup.user.name })}
              </DialogTitle>
              <DialogDescription>
                {t('platformUsers.setupCodeDialog.description')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-start gap-2">
              <span className="text-sm text-muted-foreground">
                {t('platformUsers.setupCodeDialog.codeLabel')}
              </span>
              <bdi dir="ltr" className="text-2xl font-bold tabular-nums select-all">
                {setup.setupCode}
              </bdi>
              <span className="text-sm text-muted-foreground">
                {t('platformUsers.setupCodeDialog.expires', {
                  date: formatDateTime(setup.setupCodeExpiresAt),
                })}
              </span>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => void copy(setup.setupCode)}>
                {t('platformUsers.setupCodeDialog.copy')}
              </Button>
              <DialogClose render={<Button />}>
                {t('platformUsers.setupCodeDialog.done')}
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
