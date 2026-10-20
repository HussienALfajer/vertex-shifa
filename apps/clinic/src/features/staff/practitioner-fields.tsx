import { useMutation, useQuery } from '@tanstack/react-query';
import { type Gender, practitionerPhotoUpload, type Specialty } from '@vertex-shifa/contracts';
import {
  Avatar,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  MultiCombobox,
  Skeleton,
  ToggleGroup,
  ToggleGroupItem,
} from '@vertex-shifa/ui';
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import { ImageLoadFailed } from '../../components/image-load-failed';
import { QueryStates } from '../../components/query-states';
import { useErrorText } from '../../lib/error-text';
import type { PractitionerDraft, PractitionerErrors } from './practitioner-draft';
import {
  practitionerPhotoQuery,
  removePhoto,
  replacePhoto,
  specialtiesQuery,
  useStaffCache,
} from './queries';

const genders: Gender[] = ['male', 'female'];

/** The doctor profile's fields (screens 7 and 8): names, gender, 1–3 specialties, syndicate. */
export function PractitionerFields({
  draft,
  onChange,
  errors,
  disabled,
  specialties,
}: {
  draft: PractitionerDraft;
  onChange: (draft: PractitionerDraft) => void;
  errors: PractitionerErrors;
  disabled: boolean;
  specialties: Specialty[];
}) {
  const { t } = useTranslation('clinic');
  const change = (patch: Partial<PractitionerDraft>) => onChange({ ...draft, ...patch });
  const byId = new Map(specialties.map((specialty) => [specialty.id, specialty]));
  const chosen = draft.specialtyIds.flatMap((id) => byId.get(id) ?? []);
  const [main] = chosen;
  return (
    <>
      <Field invalid={errors.displayNameAr !== undefined} disabled={disabled}>
        <FieldLabel>{t('practitioner.fields.displayNameAr.label')}</FieldLabel>
        <Input
          value={draft.displayNameAr}
          onValueChange={(displayNameAr) => change({ displayNameAr })}
          maxLength={100}
        />
        <FieldDescription>{t('practitioner.fields.displayNameAr.description')}</FieldDescription>
        <FieldError match={errors.displayNameAr !== undefined}>
          {t('practitioner.fields.displayNameAr.invalid')}
        </FieldError>
      </Field>
      <Field invalid={errors.displayNameLatin !== undefined} disabled={disabled}>
        <FieldLabel>{t('practitioner.fields.displayNameLatin.label')}</FieldLabel>
        <Input
          dir="ltr"
          value={draft.displayNameLatin}
          onValueChange={(displayNameLatin) => change({ displayNameLatin })}
          maxLength={100}
        />
        <FieldError match={errors.displayNameLatin !== undefined}>
          {t('practitioner.fields.displayNameLatin.invalid')}
        </FieldError>
      </Field>
      <FieldGroup
        legend={t('practitioner.fields.gender.label')}
        error={errors.gender && t('practitioner.fields.gender.invalid')}
      >
        <ToggleGroup
          aria-label={t('practitioner.fields.gender.label')}
          value={draft.gender ? [draft.gender] : []}
          // A choice between two: pressing the chosen one again keeps it.
          onValueChange={([gender]) => gender && change({ gender: gender as Gender })}
          disabled={disabled}
        >
          {genders.map((gender) => (
            <ToggleGroupItem key={gender} value={gender}>
              {t(`practitioner.fields.gender.${gender}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldGroup>
      <Field invalid={errors.specialtyIds !== undefined} disabled={disabled}>
        <FieldLabel>{t('practitioner.fields.specialties.label')}</FieldLabel>
        <MultiCombobox
          items={specialties}
          value={chosen}
          onValueChange={(next) => change({ specialtyIds: next.map((item) => item.id) })}
          itemToLabel={(item) => item.nameAr}
          itemToKey={(item) => item.id}
          placeholder={t('practitioner.fields.specialties.placeholder')}
          emptyLabel={t('practitioner.fields.specialties.empty')}
          removeLabel={(label) => t('practitioner.fields.specialties.remove', { label })}
          invalid={errors.specialtyIds !== undefined}
          disabled={disabled}
        />
        <FieldDescription>
          {main
            ? t('practitioner.fields.specialties.main', { name: main.nameAr })
            : t('practitioner.fields.specialties.description')}
        </FieldDescription>
        <FieldError match={errors.specialtyIds !== undefined}>
          {t('practitioner.fields.specialties.invalid')}
        </FieldError>
      </Field>
      <Field invalid={errors.syndicateNumber !== undefined} disabled={disabled}>
        <FieldLabel>{t('practitioner.fields.syndicateNumber.label')}</FieldLabel>
        <Input
          dir="ltr"
          value={draft.syndicateNumber}
          onValueChange={(syndicateNumber) => change({ syndicateNumber })}
          maxLength={30}
        />
        <FieldError match={errors.syndicateNumber !== undefined}>
          {t('practitioner.fields.syndicateNumber.invalid')}
        </FieldError>
      </Field>
    </>
  );
}

/**
 * The profile given with the doctor role (screen 7): the specialties are read only then, so a
 * member without `practitioners.read` still opens the invite and member screens.
 */
export function NewPractitionerFields(
  props: Omit<Parameters<typeof PractitionerFields>[0], 'specialties'>,
) {
  const specialties = useQuery(specialtiesQuery);
  return (
    <QueryStates queries={[specialties]}>
      {() => <PractitionerFields {...props} specialties={specialties.data as Specialty[]} />}
    </QueryStates>
  );
}

/**
 * The doctor's photo, uploaded as soon as it is chosen and re-encoded by the server to a square
 * JPEG (rule 35), with a preview and remove. Without one, the initials of the name show.
 */
export function PhotoField({
  practitionerId,
  name,
  disabled,
}: {
  practitionerId: string;
  name: string;
  disabled: boolean;
}) {
  const { t } = useTranslation(['clinic', 'errors']);
  const errorText = useErrorText();
  const cache = useStaffCache();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const photo = useQuery(practitionerPhotoQuery(practitionerId));
  const upload = useMutation({
    mutationFn: (file: File) => replacePhoto(practitionerId, file),
    onSuccess: (saved) => cache.photoChanged(practitionerId, saved),
    onError: (refusal) => setError(errorText(refusal)),
  });
  const remove = useMutation({
    mutationFn: () => removePhoto(practitionerId),
    onSuccess: (saved) => {
      cache.photoChanged(practitionerId, null);
      return cache.practitionerSaved(saved);
    },
    onError: (refusal) => setError(errorText(refusal)),
  });
  const busy = upload.isPending || remove.isPending;

  function choose(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    // Checked here too, so an oversized photo is not sent over a slow connection.
    const accepted: readonly string[] = practitionerPhotoUpload.contentTypes;
    if (!accepted.includes(file.type) || file.size > practitionerPhotoUpload.maxBytes) {
      setError(t('errors:FILE_REJECTED'));
      return;
    }
    upload.mutate(file);
  }

  return (
    <FieldGroup legend={t('practitioner.fields.photo.label')}>
      <div className="flex flex-wrap items-center gap-4">
        {photo.isPending ? (
          <Skeleton className="size-20 rounded-full" />
        ) : photo.data ? (
          <img
            src={`data:image/jpeg;base64,${photo.data.data}`}
            alt={t('practitioner.fields.photo.alt')}
            className="size-20 rounded-full border border-border object-cover"
          />
        ) : photo.isError ? (
          <div className="size-20 rounded-full border border-border bg-muted" />
        ) : (
          <Avatar name={name} size="xl" tone="muted" />
        )}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <ImageUp aria-hidden />
              {upload.isPending
                ? t('practitioner.fields.photo.uploading')
                : photo.data
                  ? t('practitioner.fields.photo.replace')
                  : t('practitioner.fields.photo.upload')}
            </Button>
            {photo.data && (
              <Button variant="ghost" disabled={disabled || busy} onClick={() => remove.mutate()}>
                <Trash2 aria-hidden />
                {t('practitioner.fields.photo.remove')}
              </Button>
            )}
          </div>
          {!photo.data && photo.isError ? (
            <ImageLoadFailed
              text={t('practitioner.fields.photo.loadFailed')}
              onRetry={() => void photo.refetch()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {photo.data || photo.isPending
                ? t('practitioner.fields.photo.description')
                : t('practitioner.fields.photo.none')}
            </p>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={practitionerPhotoUpload.contentTypes.join(',')}
        aria-label={t('practitioner.fields.photo.upload')}
        onChange={(event) => {
          choose(event.currentTarget.files?.[0]);
          event.currentTarget.value = '';
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </FieldGroup>
  );
}
