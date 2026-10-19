import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type AccessCatalog,
  deactivateStaffSchema,
  type PreviousPractitioner,
  type StaffMember,
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
  Field,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  FormFields,
  PageHeader,
  Textarea,
  toast,
  useDraft,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { QueryStates } from '../../components/query-states';
import { useUnsavedChangesGuard } from '../../components/unsaved-changes';
import { ApiError } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { formatDateTime } from '../../lib/format';
import { useOnline } from '../../lib/online';
import { meQuery, useStaffAccess } from '../../lib/staff-access';
import {
  type AccessDraft,
  accessAdjustments,
  accessDraftFromMember,
  accessErrors,
  branchScope,
} from './access-draft';
import { AccessFields } from './access-fields';
import {
  doctorRoleDraft,
  type PractitionerDraft,
  practitionerErrors,
  practitionerInput,
} from './practitioner-draft';
import { NewPractitionerFields } from './practitioner-fields';
import {
  authorizePasswordReset,
  cancelInvitation,
  catalogQuery,
  changeAccess,
  deactivateMember,
  memberQuery,
  previousPractitionerQuery,
  reactivateMember,
  resendInvitation,
  useStaffCache,
} from './queries';
import { MemberStatus, NoAccessState, useBranches } from './staff-labels';

type Notice = { tone: 'warning' | 'danger'; text: string };

/**
 * `/settings/staff/:id` (screen 7): a member's status and its actions (resend, cancel, deactivate,
 * reactivate, authorize a password reset), their roles, branches and permissions, and their doctor
 * profile. Read-only for `staff.read` without `staff.manage`.
 */
export function MemberScreen({ id }: { id: string }) {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const me = useQuery(meQuery);
  const member = useQuery({ ...memberQuery(id), enabled: access.readStaff });
  const catalog = useQuery(catalogQuery);
  // The owner reviews the member's previous doctor profile when giving the role back (rule 9).
  const previous = useQuery({ ...previousPractitionerQuery(id), enabled: access.manageStaff });
  const branches = useBranches();
  if (me.data && !access.readStaff) return <NoAccessState />;
  const queries = [
    me,
    member,
    catalog,
    ...branches.queries,
    ...(access.manageStaff ? [previous] : []),
  ];
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <QueryStates queries={queries}>
        {() => {
          const shown = member.data as StaffMember;
          return (
            <>
              <PageHeader
                back={
                  <BackButton render={<Link to="/settings/staff" />}>{t('nav.staff')}</BackButton>
                }
                title={shown.name}
                description={
                  <span>
                    {t('staff.member.phone')} <bdi dir="ltr">{shown.phone}</bdi>
                  </span>
                }
              />
              <MemberDetail
                key={shown.id}
                member={shown}
                catalog={catalog.data as AccessCatalog}
                previous={previous.data ?? noPrevious}
              />
            </>
          );
        }}
      </QueryStates>
    </section>
  );
}

type MemberDraft = { access: AccessDraft; practitioner: PractitionerDraft };

/** A member who has a current doctor profile, or never had one, or a reader without `staff.manage`. */
const noPrevious: PreviousPractitioner = { practitioner: null, photo: null };

function memberDraft(member: StaffMember, previous: PreviousPractitioner): MemberDraft {
  return {
    access: accessDraftFromMember(member),
    practitioner: doctorRoleDraft(member.name, previous.practitioner),
  };
}

function MemberDetail({
  member,
  catalog,
  previous,
}: {
  member: StaffMember;
  catalog: AccessCatalog;
  previous: PreviousPractitioner;
}) {
  const { t } = useTranslation(['clinic', 'common']);
  const access = useStaffAccess();
  const me = useQuery(meQuery);
  const online = useOnline();
  const errorText = useErrorText();
  const cache = useStaffCache();
  const branches = useBranches();
  const { draft, setDraft, dirty, discard, reset } = useDraft(() => memberDraft(member, previous));
  const guard = useUnsavedChangesGuard(dirty);
  // The version the owner started editing: a newer one on the server is a conflict (rule 10).
  const [base, setBase] = useState(member.updatedAt);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  // The doctor role is being given: its profile comes in the same change, the previous one shown
  // for review when the member had one (rule 9, edge case 11).
  const addsDoctor = draft.access.roles.includes('doctor') && member.practitionerId === null;
  const restores = addsDoctor && previous.practitioner !== null;
  const problems = checking ? errorsOf(draft, addsDoctor) : undefined;
  const editable = access.manageStaff && member.archivedAt === null;

  /** An action changed the member: an untouched form follows it, an edited one keeps its base. */
  function changed(saved: StaffMember) {
    void cache.memberSaved(saved);
    if (!dirty) {
      setBase(saved.updatedAt);
      reset(memberDraft(saved, previous));
    }
  }

  /** The profile the doctor role would bring back after `saved`, read now. */
  async function previousAfter(saved: StaffMember): Promise<PreviousPractitioner> {
    if (saved.practitionerId !== null) return noPrevious;
    try {
      return await cache.reloadPreviousPractitioner(saved.id);
    } catch {
      // Offline or refused: the owner fills the profile in, and it is restored with what they typed.
      return noPrevious;
    }
  }

  const save = useMutation({
    mutationFn: (sent: MemberDraft) =>
      changeAccess(member.id, {
        roles: sent.access.roles,
        branchScope: branchScope(sent.access),
        adjustments: accessAdjustments(catalog, sent.access),
        ...(sent.access.roles.includes('doctor') && member.practitionerId === null
          ? { practitioner: practitionerInput(sent.practitioner) }
          : {}),
        expectedUpdatedAt: base,
      }),
    onSuccess: async (saved) => {
      await cache.memberSaved(saved);
      const next = await previousAfter(saved);
      setBase(saved.updatedAt);
      reset(memberDraft(saved, next));
      setChecking(false);
      toast.add({ title: t('states.saved'), type: 'success' });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        try {
          const fresh = await cache.reloadMember(member.id);
          reset(memberDraft(fresh, await previousAfter(fresh)));
          setBase(fresh.updatedAt);
          setNotice({ tone: 'warning', text: t('states.conflictReloaded') });
          return;
        } catch {
          // Shown below as the conflict's own text.
        }
      }
      setNotice({ tone: 'danger', text: errorText(error) });
    },
  });

  function submit(): boolean {
    setNotice(undefined);
    setChecking(true);
    if (hasErrors(errorsOf(draft, addsDoctor))) return false;
    save.mutate(draft);
    return true;
  }

  function discardChanges() {
    setNotice(undefined);
    setChecking(false);
    discard();
  }

  return (
    <>
      <OfflineNotice />
      {!access.manageStaff && <Callout title={t('staff.readOnly')} />}
      <MemberActions member={member} onChanged={changed} />
      <Form onSubmit={submit} busy={save.isPending} className="flex flex-col gap-6">
        <FormFields>
          <Card className="flex flex-col gap-6 p-6">
            <CardTitle>{t('staff.member.accessTitle')}</CardTitle>
            <AccessFields
              draft={draft.access}
              onChange={(next) => setDraft((current) => ({ ...current, access: next }))}
              catalog={catalog}
              errors={problems?.access ?? {}}
              disabled={!editable}
              offerOwner={access.manageStaff}
              branches={branches.inUse}
              self={member.id === me.data?.membershipId}
            />
          </Card>
          {addsDoctor && (
            <Card className="flex flex-col gap-6 p-6">
              <div className="flex flex-col gap-1">
                <CardTitle>{t('practitioner.fields.title')}</CardTitle>
                <CardDescription>
                  {restores
                    ? t('staff.member.doctorProfileRestored')
                    : t('staff.member.doctorProfileNeeded')}
                </CardDescription>
              </div>
              {restores && previous.photo && (
                <div className="flex flex-wrap items-center gap-4">
                  <img
                    src={`data:image/jpeg;base64,${previous.photo.data}`}
                    alt={t('practitioner.fields.photo.alt')}
                    className="size-20 rounded-full border border-border object-cover"
                  />
                  <p className="text-sm text-muted-foreground">{t('staff.member.previousPhoto')}</p>
                </div>
              )}
              <NewPractitionerFields
                draft={draft.practitioner}
                onChange={(practitioner) => setDraft((current) => ({ ...current, practitioner }))}
                errors={problems?.practitioner ?? {}}
                disabled={!editable}
              />
            </Card>
          )}
        </FormFields>
        {editable && (
          <FormActions>
            <Button type="submit" loading={save.isPending} disabled={!online || !dirty}>
              {t('staff.member.save')}
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={discardChanges} disabled={save.isPending}>
                {t('common:discardChanges')}
              </Button>
            )}
          </FormActions>
        )}
        {notice && <Callout role="alert" tone={notice.tone} title={notice.text} />}
      </Form>
      {member.practitionerId && (
        <Card>
          <CardHeader>
            <CardTitle>{t('staff.member.doctorProfile')}</CardTitle>
            <CardDescription>{t('staff.member.doctorProfileDescription')}</CardDescription>
          </CardHeader>
          <div>
            <Button
              variant="outline"
              render={<Link to="/settings/staff/$id/profile" params={{ id: member.id }} />}
            >
              {t('staff.member.openProfile')}
            </Button>
          </div>
        </Card>
      )}
      {guard.dialog}
    </>
  );
}

/** What the owner can do in the member's status (spec S02 "Staff membership"). */
function MemberActions({
  member,
  onChanged,
}: {
  member: StaffMember;
  onChanged: (saved: StaffMember) => void;
}) {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const online = useOnline();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const [resetUntil, setResetUntil] = useState<string>();
  const done = (message: string) => (saved: StaffMember) => {
    onChanged(saved);
    toast.add({ title: message, type: 'success' });
  };
  const failed = (refusal: unknown) => setError(errorText(refusal));
  const resend = useMutation({
    mutationFn: () => resendInvitation(member.id),
    onMutate: () => setError(undefined),
    onSuccess: done(t('staff.member.resent')),
    onError: failed,
  });
  const cancel = useMutation({
    mutationFn: () => cancelInvitation(member.id),
    onMutate: () => setError(undefined),
    onSuccess: (saved) => {
      done(t('staff.member.cancelled'))(saved);
      void navigate({ to: '/settings/staff' });
    },
    onError: failed,
  });
  const reactivate = useMutation({
    mutationFn: () => reactivateMember(member.id),
    onMutate: () => setError(undefined),
    onSuccess: done(t('staff.member.reactivated')),
    onError: failed,
  });
  const passwordReset = useMutation({
    mutationFn: () => authorizePasswordReset(member.id),
    onMutate: () => setError(undefined),
    onSuccess: (result) => setResetUntil(result.passwordResetAuthorizedUntil),
    onError: failed,
  });
  const busy = [resend, cancel, reactivate, passwordReset].some((action) => action.isPending);
  const disabled = !online || busy;

  const since =
    member.status === 'deactivated' && member.deactivatedAt
      ? t('staff.member.deactivatedSince', { date: formatDateTime(member.deactivatedAt) })
      : member.status === 'active' && member.acceptedAt
        ? t('staff.member.acceptedSince', { date: formatDateTime(member.acceptedAt) })
        : undefined;
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start gap-3">
        <MemberStatus member={member} />
        {since && <p className="text-muted-foreground">{since}</p>}
      </div>
      {member.archivedAt && (
        <p className="text-muted-foreground">{t('staff.member.cancelledNotice')}</p>
      )}
      {access.manageStaff && !member.archivedAt && (
        <div className="flex flex-wrap gap-2">
          {member.status === 'invited' && (
            <>
              <Button
                variant="outline"
                loading={resend.isPending}
                disabled={disabled}
                onClick={() => resend.mutate()}
              >
                {t('staff.member.resend')}
              </Button>
              <Confirm
                trigger={t('staff.member.cancel')}
                title={t('staff.member.cancelDialog.title', { name: member.name })}
                description={t('staff.member.cancelDialog.description')}
                confirm={t('staff.member.cancelDialog.confirm')}
                disabled={disabled}
                onConfirm={() => cancel.mutate()}
              />
            </>
          )}
          {member.status === 'active' && (
            <>
              <Confirm
                trigger={t('staff.member.passwordReset')}
                title={t('staff.member.passwordResetDialog.title', { name: member.name })}
                description={t('staff.member.passwordResetDialog.description')}
                confirm={t('staff.member.passwordResetDialog.confirm')}
                disabled={disabled}
                destructive={false}
                onConfirm={() => passwordReset.mutate()}
              />
              <DeactivateDialog
                member={member}
                disabled={disabled}
                onDone={done(t('staff.member.deactivated'))}
              />
            </>
          )}
          {member.status === 'deactivated' && (
            <Button
              variant="outline"
              loading={reactivate.isPending}
              disabled={disabled}
              onClick={() => reactivate.mutate()}
            >
              {t('staff.member.reactivate')}
            </Button>
          )}
        </div>
      )}
      {resetUntil && (
        <Callout
          role="status"
          tone="info"
          title={t('staff.member.passwordResetDone', { date: formatDateTime(resetUntil) })}
        />
      )}
      {error && <Callout role="alert" tone="danger" title={error} />}
    </Card>
  );
}

function Confirm({
  trigger,
  title,
  description,
  confirm,
  disabled,
  destructive = true,
  onConfirm,
}: {
  trigger: string;
  title: string;
  description: string;
  confirm: string;
  disabled: boolean;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('clinic');
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" disabled={disabled} />}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="outline" />}>
            {t('staff.member.back')}
          </AlertDialogClose>
          <AlertDialogClose
            render={<Button variant={destructive ? 'destructive' : 'primary'} />}
            onClick={onConfirm}
          >
            {confirm}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Rules 5 and 8: with a reason kept in the audit; never the last active owner (`LAST_OWNER`). */
function DeactivateDialog({
  member,
  disabled,
  onDone,
}: {
  member: StaffMember;
  disabled: boolean;
  onDone: (saved: StaffMember) => void;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [checking, setChecking] = useState(false);
  const invalid = checking && !deactivateStaffSchema.safeParse({ reason }).success;
  const deactivate = useMutation({
    mutationFn: (text: string) => deactivateMember(member.id, text),
    onSuccess: (saved) => {
      setOpen(false);
      onDone(saved);
    },
  });

  function submit(): boolean {
    setChecking(true);
    const parsed = deactivateStaffSchema.safeParse({ reason });
    if (!parsed.success) return false;
    deactivate.mutate(parsed.data.reason);
    return true;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (deactivate.isPending) return;
        setOpen(next);
        if (next) {
          setReason('');
          setChecking(false);
          deactivate.reset();
        }
      }}
    >
      <Button variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        {t('staff.member.deactivate')}
      </Button>
      <DialogContent>
        <Form onSubmit={submit} busy={deactivate.isPending} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>
              {t('staff.member.deactivateDialog.title', { name: member.name })}
            </DialogTitle>
            <DialogDescription>{t('staff.member.deactivateDialog.description')}</DialogDescription>
          </DialogHeader>
          <FormFields>
            <Field invalid={invalid}>
              <FieldLabel>{t('staff.member.deactivateDialog.reason')}</FieldLabel>
              <Textarea
                value={reason}
                onChange={(event) => setReason(event.currentTarget.value)}
                maxLength={500}
              />
              <FieldError match={invalid}>
                {t('staff.member.deactivateDialog.reasonInvalid')}
              </FieldError>
            </Field>
          </FormFields>
          {deactivate.error && (
            <Callout role="alert" tone="danger" title={errorText(deactivate.error)} />
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={deactivate.isPending} />}>
              {t('staff.member.back')}
            </DialogClose>
            <Button type="submit" variant="destructive" loading={deactivate.isPending}>
              {t('staff.member.deactivateDialog.confirm')}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type MemberErrors = {
  access: ReturnType<typeof accessErrors>;
  practitioner: ReturnType<typeof practitionerErrors>;
};

function errorsOf(draft: MemberDraft, addsDoctor: boolean): MemberErrors {
  return {
    access: accessErrors(draft.access),
    practitioner: addsDoctor ? practitionerErrors(draft.practitioner) : {},
  };
}

function hasErrors(errors: MemberErrors): boolean {
  return Object.keys(errors.access).length > 0 || Object.keys(errors.practitioner).length > 0;
}
