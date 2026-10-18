import { useMutation } from '@tanstack/react-query';
import type { Facility } from '@vertex-shifa/contracts';
import { Button, Callout, Card, Field, FieldError, FieldLabel, Input } from '@vertex-shifa/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { ApiError } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import {
  type DraftErrors,
  draftFromFacility,
  emptyDraft,
  type FacilityDraft,
  facilityInput,
  facilityUpdate,
  locationErrors,
  nameErrors,
  weekErrors,
} from '../tenancy/facility-draft';
import { LocationFields } from '../tenancy/location-fields';
import { createFacility, updateFacility, useSetupCache } from '../tenancy/queries';
import { isTenantWritable, useCanSave } from '../tenancy/setup-access';
import { useTenant } from '../tenancy/tenant-gate';
import { DisplayFields, WeekFields } from '../tenancy/week-fields';

type Notice = { tone: 'info' | 'warning' | 'danger'; text: string };

/**
 * A branch's settings in one form (screen 5): its name, the location fields (step 2), the week
 * (step 3) and the waiting-room display (step 4). Without `facility` it adds a branch.
 * A single-branch clinic hides the name (rule 9).
 */
export function FacilityForm({
  facility,
  governorateId,
  showName,
  allowed,
  onCreated,
}: {
  facility?: Facility;
  governorateId?: string | undefined;
  showName: boolean;
  /** `facility.manage` on this branch, or `tenant.manage` to add one (cosmetic). */
  allowed: boolean;
  onCreated?: (facility: Facility) => void;
}) {
  const { t } = useTranslation('clinic');
  const tenant = useTenant();
  const errorText = useErrorText();
  const cache = useSetupCache();
  const canSave = useCanSave(tenant, allowed);
  const [saved, setSaved] = useState(facility);
  // Set by the first create: the branches in use just before it, read from the server, and the
  // names sent. After a failed create, a new branch with one of those names is the one whose answer
  // was lost.
  const creating = useRef<{ known: Set<string>; names: Set<string> }>(undefined);
  const [draft, setDraft] = useState<FacilityDraft>(() =>
    facility ? draftFromFacility(facility, governorateId) : emptyDraft(''),
  );
  // Errors show once the owner tried to save, and follow every change after that.
  const [checking, setChecking] = useState(false);
  const problems: DraftErrors = checking
    ? { ...(showName ? nameErrors(draft) : {}), ...locationErrors(draft), ...weekErrors(draft) }
    : {};
  const [notice, setNotice] = useState<Notice>();
  const change = (patch: Partial<FacilityDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  /** Shows a branch as saved on the server, in place of the form's values. */
  async function showSaved(record: Facility) {
    const city = await cache.reloadArea(record.areaId);
    setSaved(record);
    setDraft(draftFromFacility(record, city.parentId ?? undefined));
  }

  // The form is locked while a save runs, so the values saved are the values shown.
  const save = useMutation({
    // `saved.updatedAt` is the version this form started from (rule 16).
    mutationFn: async (): Promise<Facility | 'recovered'> => {
      if (saved) return updateFacility(saved.id, facilityUpdate(draft, saved, saved.updatedAt));
      const branches = (await cache.reloadFacilities()).items;
      if (creating.current) {
        const { known, names } = creating.current;
        const lost = branches.find((branch) => !known.has(branch.id) && names.has(branch.name));
        // Probably the branch whose answer was lost, but only probably: it is never overwritten.
        // Its saved values are shown, and the owner saves again against its updatedAt (rule 16).
        if (lost) {
          await showSaved(lost);
          return 'recovered';
        }
      }
      const input = facilityInput(draft);
      creating.current ??= {
        known: new Set(branches.map((branch) => branch.id)),
        names: new Set(),
      };
      creating.current.names.add(input.name);
      return createFacility(input);
    },
    onSuccess: async (result) => {
      if (result === 'recovered') {
        setNotice({ tone: 'warning', text: t('states.createRecovered') });
        return;
      }
      await cache.facilitySaved(result);
      if (!saved && onCreated) {
        onCreated(result);
        return;
      }
      setSaved(result);
      setNotice({ tone: 'info', text: t('states.saved') });
    },
    onError: async (error) => {
      if (saved && error instanceof ApiError && error.code === 'CONFLICT') {
        try {
          await showSaved(await cache.reloadFacility(saved.id));
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

  const editable = allowed && isTenantWritable(tenant) && !save.isPending;

  function submit() {
    setNotice(undefined);
    setChecking(true);
    const found = {
      ...(showName ? nameErrors(draft) : {}),
      ...locationErrors(draft),
      ...weekErrors(draft),
    };
    if (Object.keys(found).length === 0) save.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <OfflineNotice />
      {!allowed && <Callout title={t('settings.readOnly')} />}
      {notice && (
        <Callout
          role={notice.tone === 'info' ? 'status' : 'alert'}
          tone={notice.tone}
          title={notice.text}
        />
      )}
      <Card className="flex flex-col gap-6 p-6">
        {showName && (
          <Field invalid={problems.name !== undefined} disabled={!editable}>
            <FieldLabel>{t('fields.branchName.label')}</FieldLabel>
            <Input value={draft.name} onValueChange={(name) => change({ name })} maxLength={100} />
            <FieldError match={problems.name !== undefined}>
              {t('fields.branchName.invalid')}
            </FieldError>
          </Field>
        )}
        <LocationFields draft={draft} onChange={change} errors={problems} disabled={!editable} />
      </Card>
      <Card className="flex flex-col gap-6 p-6">
        <WeekFields draft={draft} onChange={change} errors={problems} disabled={!editable} />
      </Card>
      <Card className="flex flex-col gap-6 p-6">
        <DisplayFields draft={draft} onChange={change} disabled={!editable} />
      </Card>
      {allowed && (
        <Button className="w-fit" onClick={submit} disabled={!canSave || save.isPending}>
          {saved ? t('settings.save') : t('branches.new.create')}
        </Button>
      )}
    </div>
  );
}
