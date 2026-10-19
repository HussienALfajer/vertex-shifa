import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  type ClinicalReadScope,
  clinicalReadScopeSchema,
  idleLockMinutesSchema,
  type Tenant,
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
  ToggleGroup,
  ToggleGroupItem,
  toast,
  useDraft,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import { OfflineNotice } from '../../components/offline-notice';
import { useUnsavedChangesGuard } from '../../components/unsaved-changes';
import { ApiError } from '../../lib/api';
import { logErrorLabel } from '../../lib/error-logging';
import { useErrorText } from '../../lib/error-text';
import { useOnline } from '../../lib/online';
import { useStaffAccess } from '../../lib/staff-access';
import { currentRegistration, installationQuery } from '../identity/installation';
import { refreshDevice } from '../identity/session';
import { updateSecurity, useSetupCache } from '../tenancy/queries';
import { useTenant } from '../tenancy/tenant-gate';

type SecurityDraft = { idleLockMinutes: string; clinicalReadScope: ClinicalReadScope };

type Notice = { tone: 'warning' | 'danger'; text: string };

function securityDraft(tenant: Tenant): SecurityDraft {
  return {
    idleLockMinutes: String(tenant.idleLockMinutes),
    clinicalReadScope: tenant.clinicalReadScope,
  };
}

/** Whole minutes from 5 to 60 (rule 25), or nothing. */
function idleMinutes(text: string): number | undefined {
  const parsed = idleLockMinutesSchema.safeParse(/^\d+$/.test(text.trim()) ? Number(text) : NaN);
  return parsed.success ? parsed.data : undefined;
}

const scopes = clinicalReadScopeSchema.options;

/**
 * `/settings/security` (screen 10), the owner (`tenant.manage`): the idle-lock minutes and the
 * clinical read scope S11 applies. Refused only while the clinic is closed.
 */
export function SecurityScreen() {
  const { t } = useTranslation(['clinic', 'common']);
  const tenant = useTenant();
  const access = useStaffAccess();
  const online = useOnline();
  const errorText = useErrorText();
  const cache = useSetupCache();
  const queryClient = useQueryClient();
  const { draft, setDraft, dirty, discard, reset } = useDraft(() => securityDraft(tenant));
  const guard = useUnsavedChangesGuard(dirty);
  // The version the owner started editing: a newer one on the server is a conflict (rule 10).
  const [base, setBase] = useState(tenant.updatedAt);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const minutesInvalid = checking && idleMinutes(draft.idleLockMinutes) === undefined;

  const save = useMutation({
    mutationFn: (sent: SecurityDraft) =>
      updateSecurity({
        idleLockMinutes: idleMinutes(sent.idleLockMinutes) as number,
        clinicalReadScope: sent.clinicalReadScope,
        expectedUpdatedAt: base,
      }),
    onSuccess: (saved) => {
      cache.tenantSaved(saved);
      setBase(saved.updatedAt);
      reset(securityDraft(saved));
      setChecking(false);
      toast.add({ title: t('states.saved'), type: 'success' });
      // The new idle lock reaches this computer now; the others on their next connection.
      const view = queryClient.getQueryData(installationQuery.queryKey);
      const registration = view && currentRegistration(view);
      if (registration) refreshDevice(registration).catch(logErrorLabel);
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        try {
          const fresh = await cache.reloadTenant();
          reset(securityDraft(fresh));
          setBase(fresh.updatedAt);
          setNotice({ tone: 'warning', text: t('states.conflictReloaded') });
          return;
        } catch {
          // Shown below as the conflict's own text.
        }
      }
      setNotice({ tone: 'danger', text: errorText(error) });
      void cache.refused(error);
    },
  });

  const editable = access.manageTenant && tenant.status !== 'closed';

  function submit(): boolean {
    setNotice(undefined);
    setChecking(true);
    if (idleMinutes(draft.idleLockMinutes) === undefined) return false;
    save.mutate(draft);
    return true;
  }

  function discardChanges() {
    setNotice(undefined);
    setChecking(false);
    discard();
  }

  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        back={<BackButton render={<Link to="/" />}>{t('nav.home')}</BackButton>}
        title={t('security.title')}
        description={t('security.description')}
      />
      <OfflineNotice />
      {!access.manageTenant && <Callout title={t('settings.readOnly')} />}
      <Form onSubmit={submit} busy={save.isPending}>
        <Card className="flex flex-col gap-6 p-6">
          <FormFields>
            <Field invalid={minutesInvalid} disabled={!editable}>
              <FieldLabel>{t('security.idleLock.label')}</FieldLabel>
              <Input
                dir="ltr"
                inputMode="numeric"
                className="max-w-32"
                value={draft.idleLockMinutes}
                onValueChange={(idleLockMinutes) =>
                  setDraft((current) => ({ ...current, idleLockMinutes }))
                }
                maxLength={2}
              />
              <FieldDescription>{t('security.idleLock.description')}</FieldDescription>
              <FieldError match={minutesInvalid}>{t('security.idleLock.invalid')}</FieldError>
            </Field>
            <FieldGroup
              legend={t('security.scope.label')}
              description={t(`security.scope.${draft.clinicalReadScope}Description`)}
            >
              <ToggleGroup
                aria-label={t('security.scope.label')}
                className="flex-wrap"
                value={[draft.clinicalReadScope]}
                // A choice between two: pressing the chosen one again keeps it.
                onValueChange={([scope]) =>
                  scope &&
                  setDraft((current) => ({
                    ...current,
                    clinicalReadScope: scope as ClinicalReadScope,
                  }))
                }
                disabled={!editable}
              >
                {scopes.map((scope) => (
                  <ToggleGroupItem key={scope} value={scope}>
                    {t(`security.scope.${scope}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldGroup>
          </FormFields>
          {access.manageTenant && (
            <FormActions>
              <Button
                type="submit"
                loading={save.isPending}
                disabled={!online || !editable || !dirty}
              >
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
        </Card>
      </Form>
      {guard.dialog}
    </section>
  );
}
