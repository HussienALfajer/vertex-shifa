import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { Practitioner, Specialty, StaffMember } from '@vertex-shifa/contracts';
import {
  BackButton,
  Button,
  Callout,
  Card,
  EmptyState,
  Form,
  FormActions,
  FormFields,
  PageHeader,
  toast,
  useDraft,
} from '@vertex-shifa/ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { QueryStates } from '../../components/query-states';
import { useUnsavedChangesGuard } from '../../components/unsaved-changes';
import { ApiError } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { meQuery, useStaffAccess } from '../../lib/staff-access';
import {
  type PractitionerDraft,
  practitionerDraft,
  practitionerErrors,
  practitionerInput,
} from './practitioner-draft';
import { PhotoField, PractitionerFields } from './practitioner-fields';
import {
  memberQuery,
  practitionerQuery,
  specialtiesQuery,
  updatePractitioner,
  useStaffCache,
} from './queries';
import { NoAccessState } from './staff-labels';

type Notice = { tone: 'warning' | 'danger'; text: string };

/** `/settings/staff/:id/profile` (screen 8): a member's doctor profile, edited by the owner. */
export function MemberPractitionerScreen({ id }: { id: string }) {
  const { t } = useTranslation('clinic');
  const access = useStaffAccess();
  const me = useQuery(meQuery);
  const member = useQuery({ ...memberQuery(id), enabled: access.readStaff });
  const practitionerId = member.data?.practitionerId ?? null;
  if (me.data && !access.readStaff) return <NoAccessState />;
  const back = (
    <BackButton render={<Link to="/settings/staff/$id" params={{ id }} />}>
      {member.data?.name ?? t('nav.staff')}
    </BackButton>
  );
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <QueryStates queries={[me, member]}>
        {() =>
          practitionerId ? (
            <PractitionerLoader
              id={practitionerId}
              header={
                <PageHeader
                  back={back}
                  title={t('practitioner.title', { name: (member.data as StaffMember).name })}
                  description={t('practitioner.description')}
                />
              }
            />
          ) : (
            <NoProfile back={back} />
          )
        }
      </QueryStates>
    </section>
  );
}

/** `/me/profile` (screen 8): the signed-in doctor's own profile (rule 34). */
export function OwnPractitionerScreen() {
  const { t } = useTranslation('clinic');
  const me = useQuery(meQuery);
  const back = <BackButton render={<Link to="/me" />}>{t('identity.account.title')}</BackButton>;
  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <QueryStates queries={[me]}>
        {() => {
          const own = me.data?.practitioner;
          return own ? (
            <PractitionerLoader
              id={own.id}
              header={
                <PageHeader
                  back={back}
                  title={t('practitioner.ownTitle')}
                  description={t('practitioner.description')}
                />
              }
            />
          ) : (
            <NoProfile back={back} />
          );
        }}
      </QueryStates>
    </section>
  );
}

function NoProfile({ back }: { back: ReactNode }) {
  const { t } = useTranslation('clinic');
  return (
    <>
      <PageHeader back={back} title={t('practitioner.ownTitle')} />
      <EmptyState
        title={t('practitioner.none.title')}
        description={t('practitioner.none.description')}
      />
    </>
  );
}

function PractitionerLoader({ id, header }: { id: string; header: ReactNode }) {
  const practitioner = useQuery(practitionerQuery(id));
  const specialties = useQuery(specialtiesQuery);
  return (
    <QueryStates queries={[practitioner, specialties]}>
      {() => {
        const shown = practitioner.data as Practitioner;
        return (
          <>
            {header}
            <PractitionerForm
              key={shown.id}
              practitioner={shown}
              specialties={specialties.data as Specialty[]}
            />
          </>
        );
      }}
    </QueryStates>
  );
}

/**
 * The profile's fields and photo. The photo is saved as soon as it is chosen; the fields with
 * "Save", against the `updatedAt` the form started from (rule 10).
 */
function PractitionerForm({
  practitioner,
  specialties,
}: {
  practitioner: Practitioner;
  specialties: Specialty[];
}) {
  const { t } = useTranslation(['clinic', 'common']);
  const access = useStaffAccess();
  const online = useOnline();
  const errorText = useErrorText();
  const cache = useStaffCache();
  const allowed = access.editPractitioner(practitioner.membershipId);
  const { draft, setDraft, dirty, discard, reset } = useDraft<PractitionerDraft>(() =>
    practitionerDraft(practitioner),
  );
  const guard = useUnsavedChangesGuard(dirty);
  const [base, setBase] = useState(practitioner.updatedAt);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const problems = checking ? practitionerErrors(draft) : {};

  const save = useMutation({
    mutationFn: (sent: PractitionerDraft) =>
      updatePractitioner(practitioner.id, { ...practitionerInput(sent), expectedUpdatedAt: base }),
    onSuccess: async (saved) => {
      await cache.practitionerSaved(saved);
      setBase(saved.updatedAt);
      reset(practitionerDraft(saved));
      setChecking(false);
      toast.add({ title: t('states.saved'), type: 'success' });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        try {
          const fresh = await cache.reloadPractitioner(practitioner.id);
          reset(practitionerDraft(fresh));
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
    if (Object.keys(practitionerErrors(draft)).length > 0) return false;
    save.mutate(draft);
    return true;
  }

  function discardChanges() {
    setNotice(undefined);
    setChecking(false);
    discard();
  }

  return (
    <Form onSubmit={submit} busy={save.isPending} className="flex flex-col gap-6">
      <OfflineNotice />
      {!allowed && <Callout title={t('practitioner.readOnly')} />}
      <FormFields>
        <Card className="flex flex-col gap-6 p-6">
          <PhotoField
            practitionerId={practitioner.id}
            name={practitioner.displayNameAr}
            disabled={!allowed || !online}
          />
          <PractitionerFields
            draft={draft}
            onChange={setDraft}
            errors={problems}
            disabled={!allowed}
            specialties={specialties}
          />
        </Card>
      </FormFields>
      {allowed && (
        <FormActions>
          <Button type="submit" loading={save.isPending} disabled={!online || !dirty}>
            {t('settings.save')}
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={discardChanges} disabled={save.isPending}>
              {t('common:discardChanges')}
            </Button>
          )}
        </FormActions>
      )}
      {notice && <Callout role="alert" tone={notice.tone} title={notice.text} />}
      {guard.dialog}
    </Form>
  );
}
