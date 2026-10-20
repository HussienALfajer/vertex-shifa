import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  deviceNameSchema,
  deviceRevokeCategorySchema,
  type ManagedDevice,
  type RevokeDevice,
  revokeDeviceSchema,
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
  BackButton,
  Badge,
  Button,
  Callout,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  EmptyState,
  Field,
  FieldError,
  FieldLabel,
  Form,
  FormFields,
  Input,
  PageHeader,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
  toast,
} from '@vertex-shifa/ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import { OfflineNotice } from '../../components/offline-notice';
import { QueryStates } from '../../components/query-states';
import { useErrorText } from '../../lib/error-text';
import { formatDateTime } from '../../lib/format';
import { useOnline } from '../../lib/online';
import { meQuery, useStaffAccess } from '../../lib/staff-access';
import { NoAccessState, useBranches, useRoleNames } from '../staff/staff-labels';
import { devicesQuery, removeMember, renameDevice, revokeDevice, useDevicesCache } from './queries';

/**
 * `/settings/devices` (screen 9), `devices.manage`: the computers of the branches in the member's
 * scope with their name, branch, status, last connection, version and members; rename, revoke
 * (rule 29) and remove a member from a computer.
 */
export function DevicesScreen({ revoked }: { revoked: boolean }) {
  const { t } = useTranslation('clinic');
  const navigate = useNavigate();
  const access = useStaffAccess();
  const me = useQuery(meQuery);
  const status = revoked ? 'revoked' : 'active';
  const devices = useQuery({ ...devicesQuery(status), enabled: access.manageDevices });
  const branches = useBranches();
  if (me.data && !access.manageDevices) return <NoAccessState />;
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/" />}>{t('nav.home')}</BackButton>}
        title={t('devices.title')}
        description={t('devices.description')}
      />
      <OfflineNotice />
      <ToggleGroup
        aria-label={t('devices.filter')}
        value={[status]}
        onValueChange={([next]) => {
          if (!next || next === status) return;
          void navigate({
            to: '/settings/devices',
            search: next === 'revoked' ? { revoked: true } : {},
          });
        }}
      >
        <ToggleGroupItem value="active">{t('devices.active')}</ToggleGroupItem>
        <ToggleGroupItem value="revoked">{t('devices.revoked')}</ToggleGroupItem>
      </ToggleGroup>
      <QueryStates queries={[me, devices, ...branches.queries]}>
        {() =>
          devices.data?.length ? (
            <ul className="flex flex-col gap-4">
              {devices.data.map((item) => (
                <li key={item.id}>
                  <DeviceCard
                    device={item}
                    current={item.id === me.data?.deviceId}
                    branch={
                      branches.several || item.facilityId === null
                        ? item.facilityId
                          ? t('devices.branch', { name: branches.nameOf(item.facilityId) })
                          : t('devices.noBranch')
                        : undefined
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={revoked ? t('devices.emptyRevoked.title') : t('devices.empty.title')}
              description={
                revoked ? t('devices.emptyRevoked.description') : t('devices.empty.description')
              }
            />
          )
        }
      </QueryStates>
      {!revoked && <p className="text-sm text-muted-foreground">{t('devices.addHint')}</p>}
    </section>
  );
}

function DeviceCard({
  device,
  current,
  branch,
}: {
  device: ManagedDevice;
  current: boolean;
  /** Shown with two branches or more, or for a computer without one (S01 rule 9). */
  branch: string | undefined;
}) {
  const { t } = useTranslation('clinic');
  const online = useOnline();
  const roleNames = useRoleNames();
  const active = device.status === 'active';
  const details = [
    branch,
    active
      ? t('devices.lastSeen', { date: formatDateTime(device.lastSeenAt) })
      : device.revokedAt && t('devices.revokedAt', { date: formatDateTime(device.revokedAt) }),
    t('devices.appVersion', { version: device.appVersion }),
    device.os,
  ].filter(Boolean);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {device.name}
          {current && <Badge tone="brand">{t('devices.thisComputer')}</Badge>}
          <Badge tone={active ? 'success' : 'neutral'}>
            {t(
              active
                ? 'devices.status.active'
                : device.wipedAt
                  ? 'devices.status.wiped'
                  : 'devices.status.revoked',
            )}
          </Badge>
        </CardTitle>
        <CardDescription>{details.join(' · ')}</CardDescription>
      </CardHeader>
      {active && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold text-muted-foreground">{t('devices.members')}</h3>
            {device.members.length ? (
              <ul className="flex flex-col gap-2">
                {device.members.map((member) => (
                  <li key={member.enrollmentId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{member.name}</span>
                    <span className="text-sm text-muted-foreground">{roleNames(member.roles)}</span>
                    <RemoveMember
                      device={device}
                      enrollmentId={member.enrollmentId}
                      name={member.name}
                      disabled={!online}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t('devices.noMembers')}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <RenameDialog device={device} disabled={!online} />
            <RevokeDialog device={device} current={current} disabled={!online} />
          </div>
        </div>
      )}
    </Card>
  );
}

/** Removes the member's enrollment: they sign in with password and OTP to work there again. */
function RemoveMember({
  device,
  enrollmentId,
  name,
  disabled,
}: {
  device: ManagedDevice;
  enrollmentId: string;
  name: string;
  disabled: boolean;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const changed = useDevicesCache();
  const remove = useMutation({
    mutationFn: () => removeMember(device.id, enrollmentId),
    onSuccess: async () => {
      await changed(device.id);
      toast.add({ title: t('devices.memberRemoved'), type: 'success' });
    },
    onError: (error) => toast.add({ title: errorText(error), type: 'error' }),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" disabled={disabled} loading={remove.isPending} />}
      >
        {t('devices.removeMember', { name })}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('devices.removeMemberDialog.title', { name, device: device.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('devices.removeMemberDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t('devices.back')}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant="destructive" />}
            onClick={() => remove.mutate()}
          >
            {t('devices.removeMemberDialog.confirm')}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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

function RenameDialog({ device, disabled }: { device: ManagedDevice; disabled: boolean }) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const changed = useDevicesCache();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(device.name);
  const [checking, setChecking] = useState(false);
  const invalid = checking && !deviceNameSchema.safeParse(name).success;
  const rename = useMutation({
    mutationFn: (next: string) => renameDevice(device.id, next),
    onSuccess: async (saved) => {
      setOpen(false);
      await changed(saved.id);
      toast.add({ title: t('devices.renamed'), type: 'success' });
    },
  });
  return (
    <FormDialog
      trigger={
        <DialogTrigger render={<Button variant="outline" disabled={disabled} />}>
          {t('devices.rename')}
        </DialogTrigger>
      }
      title={t('devices.renameDialog.title')}
      busy={rename.isPending}
      open={open}
      setOpen={setOpen}
      onOpen={() => {
        setName(device.name);
        setChecking(false);
        rename.reset();
      }}
      onSubmit={() => {
        setChecking(true);
        const parsed = deviceNameSchema.safeParse(name);
        if (!parsed.success) return false;
        rename.mutate(parsed.data);
        return true;
      }}
      footer={
        <>
          <DialogClose render={<Button variant="outline" disabled={rename.isPending} />}>
            {t('devices.back')}
          </DialogClose>
          <Button type="submit" loading={rename.isPending}>
            {t('devices.renameDialog.save')}
          </Button>
        </>
      }
    >
      <FormFields>
        <Field invalid={invalid}>
          <FieldLabel>{t('devices.renameDialog.label')}</FieldLabel>
          <Input value={name} onValueChange={setName} maxLength={50} />
          <FieldError match={invalid}>{t('devices.renameDialog.invalid')}</FieldError>
        </Field>
      </FormFields>
      {rename.error && <Callout role="alert" tone="danger" title={errorText(rename.error)} />}
    </FormDialog>
  );
}

const categories = deviceRevokeCategorySchema.options;

/**
 * Rule 29: immediate on the server; the computer wipes this clinic's data on its next connection.
 * Its pending work (S04) waits in the quarantine for the owner (rule 30).
 */
function RevokeDialog({
  device,
  current,
  disabled,
}: {
  device: ManagedDevice;
  current: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const changed = useDevicesCache();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<RevokeDevice['category']>();
  const [reason, setReason] = useState('');
  const [checking, setChecking] = useState(false);
  const parsed = revokeDeviceSchema.safeParse({ category, reason });
  const problems =
    checking && !parsed.success ? parsed.error.issues.map((issue) => issue.path[0]) : [];
  const revoke = useMutation({
    mutationFn: () => revokeDevice(device.id, revokeDeviceSchema.parse({ category, reason })),
    onSuccess: async (saved) => {
      setOpen(false);
      toast.add({ title: t('devices.revokedDone'), type: 'success' });
      await changed(saved.id);
    },
  });
  return (
    <FormDialog
      trigger={
        <DialogTrigger render={<Button variant="destructive" disabled={disabled} />}>
          {t('devices.revoke')}
        </DialogTrigger>
      }
      title={t('devices.revokeDialog.title', { name: device.name })}
      description={t('devices.revokeDialog.description')}
      busy={revoke.isPending}
      open={open}
      setOpen={setOpen}
      onOpen={() => {
        setCategory(undefined);
        setReason('');
        setChecking(false);
        revoke.reset();
      }}
      onSubmit={() => {
        setChecking(true);
        if (!parsed.success) return false;
        revoke.mutate();
        return true;
      }}
      footer={
        <>
          <DialogClose render={<Button variant="outline" disabled={revoke.isPending} />}>
            {t('devices.back')}
          </DialogClose>
          <Button type="submit" variant="destructive" loading={revoke.isPending}>
            {t('devices.revokeDialog.confirm')}
          </Button>
        </>
      }
    >
      <Callout tone="warning" title={t('devices.revokeDialog.pendingWork')} />
      {current && <Callout tone="danger" title={t('devices.revokeDialog.thisComputer')} />}
      <FormFields>
        <FieldGroup
          legend={t('devices.revokeDialog.category')}
          error={
            problems.includes('category') ? t('devices.revokeDialog.categoryInvalid') : undefined
          }
        >
          <ToggleGroup
            aria-label={t('devices.revokeDialog.category')}
            className="flex-wrap"
            value={category ? [category] : []}
            onValueChange={([next]) => next && setCategory(next as RevokeDevice['category'])}
          >
            {categories.map((item) => (
              <ToggleGroupItem key={item} value={item}>
                {t(`devices.revokeDialog.categories.${item}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </FieldGroup>
        <Field invalid={problems.includes('reason')}>
          <FieldLabel>{t('devices.revokeDialog.reason')}</FieldLabel>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
            maxLength={500}
          />
          <FieldError match={problems.includes('reason')}>
            {t('devices.revokeDialog.reasonInvalid')}
          </FieldError>
        </Field>
      </FormFields>
      {revoke.error && <Callout role="alert" tone="danger" title={errorText(revoke.error)} />}
    </FormDialog>
  );
}
