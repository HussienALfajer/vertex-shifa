import { useMutation } from '@tanstack/react-query';
import type { Tenant } from '@vertex-shifa/contracts';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  PageHeader,
} from '@vertex-shifa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { ApiError } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { useStaffAccess } from '../../lib/staff-access';
import {
  LogoField,
  type ProfileErrors,
  ProfileFields,
  profileDraft,
  profileErrors,
  profileInput,
} from '../tenancy/profile-fields';
import { updateProfile, useSetupCache } from '../tenancy/queries';
import { isTenantWritable, useCanSave } from '../tenancy/setup-access';
import { useTenant } from '../tenancy/tenant-gate';

type Notice = { tone: 'info' | 'warning' | 'danger'; text: string };

/**
 * `/settings/clinic` (screen 3): the clinic's names and logo, editable by the owner and read-only
 * for other staff, with its directory status (screen 6).
 */
export function ClinicSettingsScreen() {
  const { t } = useTranslation('clinic');
  const tenant = useTenant();
  const access = useStaffAccess();
  const errorText = useErrorText();
  const cache = useSetupCache();
  const canSave = useCanSave(tenant, access.manageTenant);
  const [draft, setDraft] = useState(() => profileDraft(tenant));
  // The version the owner started editing: a newer one on the server is a conflict (rule 16).
  const [base, setBase] = useState(tenant.updatedAt);
  // Errors show once the owner tried to save, and follow every change after that.
  const [checking, setChecking] = useState(false);
  const problems: ProfileErrors = checking ? profileErrors(draft) : {};
  const [notice, setNotice] = useState<Notice>();

  const save = useMutation({
    mutationFn: () => updateProfile(profileInput(draft, base)),
    onSuccess: (saved) => {
      cache.tenantSaved(saved);
      setBase(saved.updatedAt);
      setDraft(profileDraft(saved));
      setNotice({ tone: 'info', text: t('states.saved') });
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        try {
          const fresh = await cache.reloadTenant();
          setDraft(profileDraft(fresh));
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

  // Locked while a save runs, so the values saved are the values shown.
  const editable = access.manageTenant && isTenantWritable(tenant) && !save.isPending;

  function submit() {
    setNotice(undefined);
    setChecking(true);
    if (Object.keys(profileErrors(draft)).length === 0) save.mutate();
  }

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        title={t('settings.clinic.title')}
        description={t('settings.clinic.description')}
      />
      <OfflineNotice />
      {!access.manageTenant && <Callout title={t('settings.readOnly')} />}
      {notice && (
        <Callout
          role={notice.tone === 'info' ? 'status' : 'alert'}
          tone={notice.tone}
          title={notice.text}
        />
      )}
      <Card className="flex flex-col gap-6 p-6">
        <ProfileFields draft={draft} onChange={setDraft} errors={problems} disabled={!editable} />
        <LogoField disabled={!canSave || save.isPending} />
        {access.manageTenant && (
          <Button className="w-fit" onClick={submit} disabled={!canSave || save.isPending}>
            {t('settings.save')}
          </Button>
        )}
      </Card>
      <DirectoryStatus tenant={tenant} />
    </section>
  );
}

/** Whether patients find the clinic in the Vertex Shifa app: set by Vertex staff only (rule 15). */
function DirectoryStatus({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation('clinic');
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.directory.title')}</CardTitle>
        <CardDescription className="flex flex-col gap-2">
          <span className="flex items-center gap-2 text-foreground">
            <Badge tone={tenant.directoryShown ? 'success' : 'neutral'}>
              {tenant.directoryShown
                ? t('settings.directory.shownBadge')
                : t('settings.directory.notShownBadge')}
            </Badge>
            {tenant.directoryShown
              ? t('settings.directory.shown')
              : t('settings.directory.notShown')}
          </span>
          <span>{t('settings.directory.managed')}</span>
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
