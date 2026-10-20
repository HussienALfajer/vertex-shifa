import { useMutation } from '@tanstack/react-query';
import type { Facility } from '@vertex-shifa/contracts';
import {
  Button,
  Callout,
  Card,
  Field,
  FieldError,
  FieldLabel,
  Form,
  FormActions,
  FormFields,
  Input,
  toast,
  useDraft,
} from '@vertex-shifa/ui';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { useUnsavedChangesGuard } from '../../components/unsaved-changes';
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

type Notice = { tone: 'warning' | 'danger'; text: string };

/**
 * A branch's settings in one form (screen 5): its name, the location fields (step 2), the week
 * (step 3) and the waiting-room display (step 4). Without `facility` it adds a branch.
 * A single-branch clinic hides the name (rule 9). Saving waits for a change; a saved change shows
 * as a toast, and a notice that needs attention shows under the actions, so nothing above the
 * cursor moves.
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
  const { t } = useTranslation(['clinic', 'common']);
  const tenant = useTenant();
  const errorText = useErrorText();
  const cache = useSetupCache();
  const canSave = useCanSave(tenant, allowed);
  const [saved, setSaved] = useState(facility);
  // Set by the first create: the branches in use just before it, read from the server, and the
  // names sent. After a failed create, a new branch with one of those names is the one whose answer
  // was lost.
  const creating = useRef<{ known: Set<string>; names: Set<string> }>(undefined);
  const { draft, setDraft, dirty, discard, reset } = useDraft<FacilityDraft>(() =>
    facility ? draftFromFacility(facility, governorateId) : emptyDraft(''),
  );
  const guard = useUnsavedChangesGuard(dirty);
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
    reset(draftFromFacility(record, city.parentId ?? undefined));
  }

  // The form is locked while a save runs, so the values saved are the values shown.
  const save = useMutation({
    // `saved.updatedAt` is the version this form started from (rule 16).
    mutationFn: async (sent: FacilityDraft): Promise<Facility | 'recovered'> => {
      if (saved) return updateFacility(saved.id, facilityUpdate(sent, saved, saved.updatedAt));
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
      const input = facilityInput(sent);
      creating.current ??= {
        known: new Set(branches.map((branch) => branch.id)),
        names: new Set(),
      };
      creating.current.names.add(input.name);
      return createFacility(input);
    },
    onSuccess: async (result, sent) => {
      if (result === 'recovered') {
        setNotice({ tone: 'warning', text: t('states.createRecovered') });
        return;
      }
      await cache.facilitySaved(result);
      if (!saved && onCreated) {
        // Saved, not lost: leaving for the list asks nothing.
        guard.allowLeaving();
        onCreated(result);
        return;
      }
      // The values as the server keeps them (phones in E.164) become the new starting point.
      setSaved(result);
      reset(draftFromFacility(result, sent.governorateId));
      toast.add({ title: t('states.saved'), type: 'success' });
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

  const editable = allowed && isTenantWritable(tenant);

  function submit(): boolean {
    setNotice(undefined);
    setChecking(true);
    const found = {
      ...(showName ? nameErrors(draft) : {}),
      ...locationErrors(draft),
      ...weekErrors(draft),
    };
    if (Object.keys(found).length > 0) return false;
    save.mutate(draft);
    return true;
  }

  // Discarding draws the location fields again, so a refused pasted text goes with the changes.
  const [fieldsDrawn, setFieldsDrawn] = useState(0);

  function discardChanges() {
    setNotice(undefined);
    setChecking(false);
    discard();
    setFieldsDrawn((count) => count + 1);
  }

  return (
    <Form onSubmit={submit} busy={save.isPending} className="flex flex-col gap-6">
      <OfflineNotice />
      {!allowed && <Callout title={t('settings.readOnly')} />}
      <FormFields>
        <Card className="flex flex-col gap-6 p-6">
          {showName && (
            <Field invalid={problems.name !== undefined} disabled={!editable}>
              <FieldLabel>{t('fields.branchName.label')}</FieldLabel>
              <Input
                value={draft.name}
                onValueChange={(name) => change({ name })}
                maxLength={100}
              />
              <FieldError match={problems.name !== undefined}>
                {t('fields.branchName.invalid')}
              </FieldError>
            </Field>
          )}
          <LocationFields
            key={fieldsDrawn}
            draft={draft}
            onChange={change}
            errors={problems}
            disabled={!editable}
          />
        </Card>
        <Card className="flex flex-col gap-6 p-6">
          <WeekFields draft={draft} onChange={change} errors={problems} disabled={!editable} />
        </Card>
        <Card className="flex flex-col gap-6 p-6">
          <DisplayFields draft={draft} onChange={change} disabled={!editable} />
        </Card>
      </FormFields>
      {allowed && (
        <FormActions>
          <Button type="submit" loading={save.isPending} disabled={!canSave || !dirty}>
            {saved ? t('settings.save') : t('branches.new.create')}
          </Button>
          {/* After the save button, so its appearing never moves it. */}
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
