import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type AccessCatalog,
  defaultPractitionerNameAr,
  invitedNameSchema,
  parsePhoneNumber,
  type Specialty,
  type StaffMember,
} from '@vertex-shifa/contracts';
import {
  BackButton,
  Button,
  Callout,
  Card,
  CardTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  FormFields,
  Input,
  PageHeader,
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
import { useOnline } from '../../lib/online';
import { meQuery, useStaffAccess } from '../../lib/staff-access';
import { useSetupCache } from '../tenancy/queries';
import { useTenant } from '../tenancy/tenant-gate';
import {
  type AccessDraft,
  accessAdjustments,
  accessErrors,
  branchScope,
  emptyAccessDraft,
} from './access-draft';
import { AccessFields } from './access-fields';
import {
  emptyPractitionerDraft,
  type PractitionerDraft,
  practitionerErrors,
  practitionerInput,
} from './practitioner-draft';
import { PractitionerFields } from './practitioner-fields';
import { catalogQuery, invite, specialtiesQuery, useStaffCache } from './queries';
import { NoAccessState, useBranches } from './staff-labels';

type InviteDraft = {
  phone: string;
  name: string;
  access: AccessDraft;
  practitioner: PractitionerDraft;
};

type Notice =
  | { kind: 'refused'; text: string }
  /** `ALREADY_MEMBER`: the member the phone belongs to, found in the list (rule 2). */
  | { kind: 'member'; member: StaffMember };

/**
 * `/settings/staff/new` (screen 7), owners while the clinic is active (rule 3): phone, name, roles,
 * branches, permissions and, with the doctor role, the doctor profile (rule 1). The photo is added
 * on the profile once the invitation exists.
 */
export function InviteScreen() {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const me = useQuery(meQuery);
  const catalog = useQuery(catalogQuery);
  const specialties = useQuery(specialtiesQuery);
  const branches = useBranches();
  if (me.data && !access.manageStaff) return <NoAccessState />;
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/settings/staff" />}>{t('nav.staff')}</BackButton>}
        title={t('staff.invitePage.title')}
        description={t('staff.invitePage.description')}
      />
      <QueryStates queries={[me, catalog, specialties, ...branches.queries]}>
        {() => (
          <InviteForm
            catalog={catalog.data as AccessCatalog}
            specialties={specialties.data as Specialty[]}
          />
        )}
      </QueryStates>
    </section>
  );
}

function InviteForm({
  catalog,
  specialties,
}: {
  catalog: AccessCatalog;
  specialties: Specialty[];
}) {
  const { t } = useTranslation(['clinic', 'common']);
  const navigate = useNavigate();
  const tenant = useTenant();
  const online = useOnline();
  const errorText = useErrorText();
  const cache = useStaffCache();
  const setup = useSetupCache();
  const branches = useBranches();
  const { draft, setDraft, dirty, discard } = useDraft<InviteDraft>(() => ({
    phone: '',
    name: '',
    access: emptyAccessDraft(),
    practitioner: emptyPractitionerDraft(''),
  }));
  const guard = useUnsavedChangesGuard(dirty);
  // Errors show once the owner tried to save, and follow every change after that.
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const doctor = draft.access.roles.includes('doctor');
  const phone = parsePhoneNumber(draft.phone);
  const problems = checking ? errorsOf(draft) : undefined;

  const send = useMutation({
    mutationFn: (sent: InviteDraft) =>
      invite({
        phone: parsePhoneNumber(sent.phone)?.e164 ?? sent.phone,
        name: invitedNameSchema.parse(sent.name),
        roles: sent.access.roles,
        branchScope: branchScope(sent.access),
        adjustments: accessAdjustments(catalog, sent.access),
        ...(sent.access.roles.includes('doctor')
          ? { practitioner: practitionerInput(sent.practitioner) }
          : {}),
      }),
    onSuccess: async (member) => {
      await cache.memberSaved(member);
      toast.add({ title: t('staff.invitePage.sent'), type: 'success' });
      guard.allowLeaving();
      void navigate({ to: '/settings/staff/$id', params: { id: member.id } });
    },
    onError: async (error, sent) => {
      if (error instanceof ApiError && error.code === 'ALREADY_MEMBER') {
        // Also where a lost answer leads: the invitation was made, and the second one refused.
        try {
          const e164 = parsePhoneNumber(sent.phone)?.e164;
          const found = (await cache.reloadStaff()).items.find((item) => item.phone === e164);
          if (found) {
            setNotice({ kind: 'member', member: found });
            return;
          }
        } catch {
          // Shown below as the refusal's own text.
        }
      }
      setNotice({ kind: 'refused', text: errorText(error) });
      void setup.refused(error);
    },
  });

  function changeAccess(next: AccessDraft) {
    setDraft((current) => {
      const addsDoctor = next.roles.includes('doctor') && !current.access.roles.includes('doctor');
      const prefill =
        addsDoctor && current.practitioner.displayNameAr === '' && current.name.trim() !== '';
      return {
        ...current,
        access: next,
        practitioner: prefill
          ? { ...current.practitioner, displayNameAr: defaultPractitionerNameAr(current.name) }
          : current.practitioner,
      };
    });
  }

  function submit(): boolean {
    setNotice(undefined);
    setChecking(true);
    if (hasErrors(errorsOf(draft))) return false;
    send.mutate(draft);
    return true;
  }

  function discardChanges() {
    setNotice(undefined);
    setChecking(false);
    discard();
  }

  const canSend = online && tenant.status === 'active';
  return (
    <Form onSubmit={submit} busy={send.isPending} className="flex flex-col gap-6">
      <OfflineNotice />
      {tenant.status !== 'active' && (
        <Callout tone="warning" title={t('staff.invitePage.notActive')} />
      )}
      <FormFields>
        <Card className="flex flex-col gap-6 p-6">
          <Field invalid={problems?.phone === true}>
            <FieldLabel>{t('staff.fields.phone.label')}</FieldLabel>
            <Input
              dir="ltr"
              inputMode="tel"
              value={draft.phone}
              onValueChange={(value) => setDraft((current) => ({ ...current, phone: value }))}
            />
            <FieldDescription>
              {phone?.kind === 'mobile' ? (
                <bdi dir="ltr">{phone.e164}</bdi>
              ) : (
                t('staff.fields.phone.description')
              )}
            </FieldDescription>
            <FieldError match={problems?.phone === true}>
              {t('staff.fields.phone.invalid')}
            </FieldError>
          </Field>
          <Field invalid={problems?.name === true}>
            <FieldLabel>{t('staff.fields.name.label')}</FieldLabel>
            <Input
              value={draft.name}
              onValueChange={(value) => setDraft((current) => ({ ...current, name: value }))}
              maxLength={100}
            />
            <FieldDescription>{t('staff.fields.name.description')}</FieldDescription>
            <FieldError match={problems?.name === true}>
              {t('staff.fields.name.invalid')}
            </FieldError>
          </Field>
        </Card>
        <Card className="flex flex-col gap-6 p-6">
          <AccessFields
            draft={draft.access}
            onChange={changeAccess}
            catalog={catalog}
            errors={problems?.access ?? {}}
            disabled={false}
            offerOwner
            branches={branches.inUse}
          />
        </Card>
        {doctor && (
          <Card className="flex flex-col gap-6 p-6">
            <CardTitle>{t('practitioner.fields.title')}</CardTitle>
            <PractitionerFields
              draft={draft.practitioner}
              onChange={(practitioner) => setDraft((current) => ({ ...current, practitioner }))}
              errors={problems?.practitioner ?? {}}
              disabled={false}
              specialties={specialties}
            />
          </Card>
        )}
      </FormFields>
      <FormActions>
        <Button type="submit" loading={send.isPending} disabled={!canSend || !dirty}>
          {t('staff.invitePage.submit')}
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={discardChanges} disabled={send.isPending}>
            {t('common:discardChanges')}
          </Button>
        )}
      </FormActions>
      {notice?.kind === 'refused' && <Callout role="alert" tone="danger" title={notice.text} />}
      {notice?.kind === 'member' && (
        <Callout
          role="alert"
          tone="warning"
          title={
            notice.member.status === 'deactivated'
              ? t('staff.alreadyMember.deactivated')
              : t('staff.alreadyMember.title')
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                guard.allowLeaving();
                void navigate({ to: '/settings/staff/$id', params: { id: notice.member.id } });
              }}
            >
              {t('staff.alreadyMember.open', { name: notice.member.name })}
            </Button>
          }
        />
      )}
      {guard.dialog}
    </Form>
  );
}

type InviteErrors = {
  phone?: true;
  name?: true;
  access: ReturnType<typeof accessErrors>;
  practitioner: ReturnType<typeof practitionerErrors>;
};

function errorsOf(draft: InviteDraft): InviteErrors {
  return {
    ...(parsePhoneNumber(draft.phone)?.kind === 'mobile' ? {} : { phone: true }),
    ...(invitedNameSchema.safeParse(draft.name).success ? {} : { name: true }),
    access: accessErrors(draft.access),
    practitioner: draft.access.roles.includes('doctor')
      ? practitionerErrors(draft.practitioner)
      : {},
  };
}

function hasErrors(errors: InviteErrors): boolean {
  return (
    errors.phone === true ||
    errors.name === true ||
    Object.keys(errors.access).length > 0 ||
    Object.keys(errors.practitioner).length > 0
  );
}
