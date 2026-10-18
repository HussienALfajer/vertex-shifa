import { useQuery } from '@tanstack/react-query';
import { coordinatesToDegrees, workingDaysToList } from '@vertex-shifa/contracts';
import { Badge, Button } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { FacilityDraft } from '../tenancy/facility-draft';
import type { ProfileDraft } from '../tenancy/profile-fields';
import { areaQuery, areasQuery, logoQuery } from '../tenancy/queries';
import type { SetupStep } from './setup-wizard';

/** Step 5: what will be saved, each part with "Edit" back to its step. */
export function SetupReview({
  profile,
  draft,
  onEdit,
  disabled,
}: {
  profile: ProfileDraft;
  draft: FacilityDraft;
  onEdit: (step: SetupStep) => void;
  /** While "Finish setup" is being sent. */
  disabled: boolean;
}) {
  const { t } = useTranslation('clinic');
  const logo = useQuery(logoQuery);
  const governorates = useQuery(areasQuery(undefined));
  const city = useQuery({ ...areaQuery(draft.areaId ?? ''), enabled: !!draft.areaId });
  const governorate = governorates.data?.find((area) => area.id === draft.governorateId);
  const list = (items: string[]) => items.join('، ');

  return (
    <div className="flex flex-col gap-4">
      <ReviewSection
        title={t('setup.steps.clinic')}
        onEdit={() => onEdit('clinic')}
        disabled={disabled}
      >
        <ReviewItem label={t('fields.nameAr.label')}>{profile.nameAr}</ReviewItem>
        {profile.nameLatin.trim() !== '' && (
          <ReviewItem label={t('fields.nameLatin.label')}>
            <span dir="ltr">{profile.nameLatin}</span>
          </ReviewItem>
        )}
        <ReviewItem label={t('fields.logo.label')}>
          {logo.data ? (
            <img
              src={`data:image/png;base64,${logo.data.data}`}
              alt={t('fields.logo.alt')}
              className="size-12 rounded-sm border border-border object-contain"
            />
          ) : (
            t('fields.logo.none')
          )}
        </ReviewItem>
      </ReviewSection>
      <ReviewSection
        title={t('setup.steps.location')}
        onEdit={() => onEdit('location')}
        disabled={disabled}
      >
        <ReviewItem label={t('fields.city.label')}>
          {list([city.data?.nameAr, governorate?.nameAr].filter((name) => name !== undefined))}
        </ReviewItem>
        <ReviewItem label={t('fields.addressDetails.label')}>{draft.addressDetails}</ReviewItem>
        {draft.coordinates && (
          <ReviewItem label={t('fields.location.label')}>
            <span dir="ltr">{coordinatesToDegrees(draft.coordinates).join(', ')}</span>
          </ReviewItem>
        )}
        <ReviewItem label={t('fields.phones.label')}>
          <ul className="flex flex-col gap-1">
            {draft.phones.map((entry) => (
              <li key={entry.phone} className="flex items-center gap-2">
                <span dir="ltr">{entry.phone}</span>
                {entry.whatsapp && <Badge tone="success">{t('fields.phones.whatsapp')}</Badge>}
              </li>
            ))}
          </ul>
        </ReviewItem>
      </ReviewSection>
      <ReviewSection
        title={t('setup.steps.week')}
        onEdit={() => onEdit('week')}
        disabled={disabled}
      >
        <ReviewItem label={t('fields.workingDays.label')}>
          {list(workingDaysToList(draft.workingDays).map((day) => t(`weekdays.${day}`)))}
        </ReviewItem>
        <ReviewItem label={t('fields.currency.label')}>
          {draft.defaultCurrency && t(`currencies.${draft.defaultCurrency}`)}
        </ReviewItem>
      </ReviewSection>
      <ReviewSection
        title={t('setup.steps.display')}
        onEdit={() => onEdit('display')}
        disabled={disabled}
      >
        <ReviewItem label={t('fields.displayNameFormat.label')}>
          {t(`fields.displayNameFormat.${draft.displayNameFormat}`)}
        </ReviewItem>
        <ReviewItem label={t('fields.displayCallSound.label')}>
          {draft.displayCallSound ? t('on') : t('off')}
        </ReviewItem>
      </ReviewSection>
    </div>
  );
}

function ReviewSection({
  title,
  onEdit,
  disabled,
  children,
}: {
  title: string;
  onEdit: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('clinic');
  return (
    <section className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold">{title}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          disabled={disabled}
          aria-label={t('setup.editStep', { step: title })}
        >
          {t('setup.edit')}
        </Button>
      </div>
      <dl className="grid gap-3 sm:grid-cols-[minmax(10rem,auto)_1fr]">{children}</dl>
    </section>
  );
}

function ReviewItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="wrap-anywhere">{children}</dd>
    </>
  );
}
