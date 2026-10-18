import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CurrencyCode, Facility, Tenant } from '@vertex-shifa/contracts';
import {
  Button,
  Callout,
  Card,
  Form,
  FormActions,
  FormFields,
  PageHeader,
  Stepper,
  useDraft,
} from '@vertex-shifa/ui';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { useUnsavedChangesGuard } from '../../components/unsaved-changes';
import { ApiError } from '../../lib/api';
import { useErrorText } from '../../lib/error-text';
import { useStaffAccess } from '../../lib/staff-access';
import {
  type DraftErrors,
  draftFromFacility,
  emptyDraft,
  type FacilityDraft,
  facilityInput,
  facilityUpdate,
  locationErrors,
  weekErrors,
} from '../tenancy/facility-draft';
import { LocationFields } from '../tenancy/location-fields';
import {
  LogoField,
  type ProfileDraft,
  type ProfileErrors,
  ProfileFields,
  profileDraft,
  profileErrors,
  profileInput,
} from '../tenancy/profile-fields';
import {
  completeOnboarding,
  createFacility,
  facilitiesQuery,
  updateFacility,
  updateProfile,
  useSetupCache,
} from '../tenancy/queries';
import { isTenantWritable, useCanSave } from '../tenancy/setup-access';
import { DisplayFields, WeekFields } from '../tenancy/week-fields';
import { SetupReview } from './setup-review';

export const setupSteps = ['clinic', 'location', 'week', 'display', 'review'] as const;

export type SetupStep = (typeof setupSteps)[number];

/**
 * The branch is created at the location step, before the owner picks a currency at the week step,
 * and the API needs one: this stands in until then, and the week step asks for an explicit choice.
 */
const UNCHOSEN_CURRENCY: CurrencyCode = 'USD';

type Notice = { tone: 'warning' | 'danger'; text: string };

/**
 * The onboarding wizard (screen 1): five steps, each saved to the server on "Next" (rule 3), edits
 * carrying the `updatedAt` they started from (rule 16). The stepper goes back to a completed step;
 * leaving with values not saved yet asks first.
 */
export function SetupWizard({
  tenant,
  branch,
  governorateId,
  initialStep,
}: {
  tenant: Tenant;
  branch: Facility | undefined;
  governorateId: string | undefined;
  initialStep: SetupStep;
}) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const cache = useSetupCache();
  const queryClient = useQueryClient();
  const access = useStaffAccess();
  const canSave = useCanSave(tenant, access.manageTenant);

  const [step, setStep] = useState<SetupStep>(initialStep);
  const profileForm = useDraft<ProfileDraft>(() => profileDraft(tenant));
  const profile = profileForm.draft;
  const [profileBase, setProfileBase] = useState(tenant.updatedAt);
  const [facility, setFacility] = useState(branch);
  /** A create failed: it may still have happened on the server, so the next save looks first. */
  const createFailed = useRef(false);
  const facilityForm = useDraft<FacilityDraft>(() => {
    if (!branch) return emptyDraft(tenant.nameAr);
    // The saved currency may be the stand-in: the owner chooses it at the week step.
    return { ...draftFromFacility(branch, governorateId), defaultCurrency: undefined };
  });
  const draft = facilityForm.draft;
  const guard = useUnsavedChangesGuard(profileForm.dirty || facilityForm.dirty);
  // Errors show once the owner tried to move on, and follow every change after that.
  const [checking, setChecking] = useState(false);
  const profileProblems: ProfileErrors = checking ? profileErrors(profile) : {};
  const problems: DraftErrors = !checking
    ? {}
    : step === 'location'
      ? locationErrors(draft)
      : step === 'week'
        ? weekErrors(draft)
        : {};
  const [notice, setNotice] = useState<Notice>();

  const index = setupSteps.indexOf(step);
  const goTo = (next: SetupStep) => {
    setNotice(undefined);
    setChecking(false);
    setStep(next);
  };

  /** Shows a branch as saved on the server; the currency is asked for again (it may be the stand-in). */
  async function showSaved(saved: Facility) {
    const city = await cache.reloadArea(saved.areaId);
    setFacility(saved);
    facilityForm.reset({
      ...draftFromFacility(saved, city.parentId ?? undefined),
      defaultCurrency: undefined,
    });
  }

  /** Reloads the record another owner changed (rule 16) and shows its values. */
  async function reloadAfterConflict(sent: SetupStep) {
    if (sent === 'clinic') {
      const fresh = await cache.reloadTenant();
      profileForm.reset(profileDraft(fresh));
      setProfileBase(fresh.updatedAt);
    } else if (facility) {
      await showSaved(await cache.reloadFacility(facility.id));
    }
    setNotice({ tone: 'warning', text: t('states.conflictReloaded') });
  }

  // Each save works on the step and values it was sent with; the form is locked until it ends.
  const save = useMutation({
    mutationFn: async (sent: {
      step: SetupStep;
      profile: ProfileDraft;
      draft: FacilityDraft;
    }): Promise<'saved' | 'recovered'> => {
      if (sent.step === 'clinic') {
        const saved = await updateProfile(profileInput(sent.profile, profileBase));
        cache.tenantSaved(saved);
        setProfileBase(saved.updatedAt);
        profileForm.reset(sent.profile);
        // The first branch takes the clinic's Arabic name as saved; untouched, that is no edit.
        if (!facility) {
          if (facilityForm.dirty) {
            facilityForm.setDraft((current) => ({ ...current, name: saved.nameAr }));
          } else {
            facilityForm.reset({ ...sent.draft, name: saved.nameAr });
          }
        }
        return 'saved';
      }
      if (sent.step === 'review') {
        cache.tenantSaved(await completeOnboarding());
        return 'saved';
      }
      if (!facility && createFailed.current) {
        // The create's answer may have been lost after the server made the branch. A guessed
        // record is never overwritten: its saved values are shown, and the owner saves again
        // against its updatedAt (rule 16).
        const [found] = (await cache.reloadFacilities()).items;
        if (found) {
          await showSaved(found);
          return 'recovered';
        }
      }
      const saved = facility
        ? await updateFacility(
            facility.id,
            facilityUpdate(sent.draft, facility, facility.updatedAt),
          )
        : await createFacility(facilityInput(sent.draft, UNCHOSEN_CURRENCY));
      await cache.facilitySaved(saved);
      setFacility(saved);
      facilityForm.reset(sent.draft);
      return 'saved';
    },
    onSuccess: (result, sent) => {
      if (result === 'recovered') {
        setNotice({ tone: 'warning', text: t('states.createRecovered') });
      } else if (sent.step !== 'review') {
        goTo(setupSteps[setupSteps.indexOf(sent.step) + 1] ?? 'review');
      }
    },
    onError: async (error, sent) => {
      if (sent.step === 'location' && !facility) createFailed.current = true;
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        try {
          await reloadAfterConflict(sent.step);
          return;
        } catch {
          // Shown below as the conflict's own text.
        }
      }
      if (error instanceof ApiError && error.code === 'ONBOARDING_INCOMPLETE') {
        // The branch is what is missing (the Arabic name is always set): back to its step.
        await queryClient.invalidateQueries({ queryKey: facilitiesQuery(false).queryKey });
        setStep('location');
      }
      setNotice({ tone: 'danger', text: errorText(error) });
      void cache.refused(error);
    },
  });

  function next(): boolean {
    setNotice(undefined);
    setChecking(true);
    if (step === 'clinic') {
      if (Object.keys(profileErrors(profile)).length > 0) return false;
      save.mutate({ step, profile, draft });
      return true;
    }
    // A branch step saves the whole branch: an error on another step sends the owner there.
    const location = locationErrors(draft);
    const { defaultCurrency, ...week } = weekErrors(draft);
    // The currency is chosen at the week step, after the location step creates the branch.
    if (step !== 'location' && defaultCurrency) Object.assign(week, { defaultCurrency });
    const failing =
      Object.keys(location).length > 0
        ? 'location'
        : Object.keys(week).length > 0
          ? 'week'
          : undefined;
    if (failing) {
      setStep(failing);
      return false;
    }
    save.mutate({ step, profile, draft });
    return true;
  }

  const busy = save.isPending;
  // Locked while a save runs (`Form`), so the values saved are the values shown.
  const editable = access.manageTenant && isTenantWritable(tenant);
  const change = (patch: Partial<FacilityDraft>) =>
    facilityForm.setDraft((current) => ({ ...current, ...patch }));

  const fields: Record<SetupStep, ReactNode> = {
    clinic: (
      <>
        <ProfileFields
          draft={profile}
          onChange={profileForm.setDraft}
          errors={profileProblems}
          disabled={!editable}
        />
        <LogoField disabled={!canSave} />
      </>
    ),
    location: (
      <LocationFields draft={draft} onChange={change} errors={problems} disabled={!editable} />
    ),
    week: <WeekFields draft={draft} onChange={change} errors={problems} disabled={!editable} />,
    display: <DisplayFields draft={draft} onChange={change} disabled={!editable} />,
    review: <SetupReview profile={profile} draft={draft} onEdit={goTo} />,
  };

  return (
    <section className="flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={t('setup.title')} description={t('setup.description')} />
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-muted-foreground">
          {t('setup.progress', { current: index + 1, total: setupSteps.length })}
        </p>
        <Stepper
          aria-label={t('setup.stepsLabel')}
          steps={setupSteps.map((key, at) =>
            t('setup.stepNumber', { number: at + 1, name: t(`setup.steps.${key}`) }),
          )}
          current={index}
          onSelect={busy ? undefined : (at) => goTo(setupSteps[at] ?? 'clinic')}
        />
      </div>
      <OfflineNotice />
      <Form onSubmit={next} busy={busy} className="flex flex-col gap-6">
        <FormFields>
          <Card className="flex flex-col gap-6 p-6">
            <h2 className="text-xl font-bold">{t(`setup.steps.${step}`)}</h2>
            {step === 'review' && (
              <p className="text-muted-foreground">{t('setup.reviewDescription')}</p>
            )}
            {fields[step]}
          </Card>
        </FormFields>
        <FormActions className="justify-between">
          {index > 0 ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => goTo(setupSteps[index - 1] ?? 'clinic')}
            >
              {t('setup.back')}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" loading={busy} disabled={!canSave}>
            {step === 'review' ? t('setup.finish') : t('setup.next')}
          </Button>
        </FormActions>
        {/* Under the actions: nothing above the cursor moves when it shows. */}
        {notice && <Callout role="alert" tone={notice.tone} title={notice.text} />}
      </Form>
      {guard.dialog}
    </section>
  );
}
