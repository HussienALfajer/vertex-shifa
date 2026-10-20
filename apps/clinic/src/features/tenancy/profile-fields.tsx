import { useMutation, useQuery } from '@tanstack/react-query';
import {
  logoUpload,
  type Tenant,
  tenantNameArSchema,
  tenantNameLatinSchema,
  type UpdateTenantProfile,
} from '@vertex-shifa/contracts';
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Skeleton,
} from '@vertex-shifa/ui';
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import { ImageLoadFailed } from '../../components/image-load-failed';
import { useErrorText } from '../../lib/error-text';
import { archiveLogo, logoQuery, replaceLogo, useSetupCache } from './queries';

/** The clinic's names as the form holds them (step 1, clinic settings). */
export type ProfileDraft = { nameAr: string; nameLatin: string };

export type ProfileErrors = Partial<Record<keyof ProfileDraft, string>>;

export function profileDraft(tenant: Tenant): ProfileDraft {
  return { nameAr: tenant.nameAr, nameLatin: tenant.nameLatin ?? '' };
}

export function profileErrors(draft: ProfileDraft): ProfileErrors {
  const errors: ProfileErrors = {};
  if (!tenantNameArSchema.safeParse(draft.nameAr).success) errors.nameAr = 'nameAr.invalid';
  if (draft.nameLatin.trim() !== '' && !tenantNameLatinSchema.safeParse(draft.nameLatin).success) {
    errors.nameLatin = 'nameLatin.invalid';
  }
  return errors;
}

export function profileInput(draft: ProfileDraft, expectedUpdatedAt: string): UpdateTenantProfile {
  return {
    nameAr: tenantNameArSchema.parse(draft.nameAr),
    nameLatin: draft.nameLatin.trim() === '' ? null : tenantNameLatinSchema.parse(draft.nameLatin),
    expectedUpdatedAt,
  };
}

/** The Arabic and Latin names of the clinic. */
export function ProfileFields({
  draft,
  onChange,
  errors,
  disabled,
}: {
  draft: ProfileDraft;
  onChange: (draft: ProfileDraft) => void;
  errors: ProfileErrors;
  disabled: boolean;
}) {
  const { t } = useTranslation('clinic');
  return (
    <>
      <Field invalid={errors.nameAr !== undefined} disabled={disabled}>
        <FieldLabel>{t('fields.nameAr.label')}</FieldLabel>
        <Input
          value={draft.nameAr}
          onValueChange={(nameAr) => onChange({ ...draft, nameAr })}
          maxLength={100}
        />
        <FieldError match={errors.nameAr !== undefined}>
          {errors.nameAr && t(`fields.${errors.nameAr}` as 'fields.nameAr.invalid')}
        </FieldError>
      </Field>
      <Field invalid={errors.nameLatin !== undefined} disabled={disabled}>
        <FieldLabel>{t('fields.nameLatin.label')}</FieldLabel>
        <Input
          dir="ltr"
          value={draft.nameLatin}
          onValueChange={(nameLatin) => onChange({ ...draft, nameLatin })}
          maxLength={100}
        />
        <FieldDescription>{t('fields.nameLatin.description')}</FieldDescription>
        <FieldError match={errors.nameLatin !== undefined}>
          {errors.nameLatin && t(`fields.${errors.nameLatin}` as 'fields.nameLatin.invalid')}
        </FieldError>
      </Field>
    </>
  );
}

/**
 * The clinic's logo, uploaded as soon as it is chosen and re-encoded by the server (rule 14), with
 * a preview and remove. Without a logo, headers and printouts show the clinic's name and the
 * Vertex Shifa mark (edge case 10).
 */
export function LogoField({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation(['clinic', 'errors']);
  const errorText = useErrorText();
  const cache = useSetupCache();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>();
  const logo = useQuery(logoQuery);
  const upload = useMutation({
    mutationFn: replaceLogo,
    onSuccess: () => cache.logoChanged(),
    onError: (refusal) => {
      setError(errorText(refusal));
      void cache.refused(refusal);
    },
  });
  const remove = useMutation({
    mutationFn: archiveLogo,
    onSuccess: (tenant) => {
      cache.tenantSaved(tenant);
      void cache.logoChanged();
    },
    onError: (refusal) => {
      setError(errorText(refusal));
      void cache.refused(refusal);
    },
  });
  const busy = upload.isPending || remove.isPending;

  function choose(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    // Checked here too, so an oversized photo is not sent over a slow connection.
    const accepted: readonly string[] = logoUpload.contentTypes;
    if (!accepted.includes(file.type) || file.size > logoUpload.maxBytes) {
      setError(t('errors:FILE_REJECTED'));
      return;
    }
    upload.mutate(file);
  }

  return (
    <FieldGroup legend={t('fields.logo.label')}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
          {logo.isPending ? (
            <Skeleton className="size-full" />
          ) : logo.data ? (
            <img
              src={`data:image/png;base64,${logo.data.data}`}
              alt={t('fields.logo.alt')}
              className="size-full object-contain"
            />
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() => input.current?.click()}
            >
              <ImageUp aria-hidden />
              {upload.isPending
                ? t('fields.logo.uploading')
                : logo.data
                  ? t('fields.logo.replace')
                  : t('fields.logo.upload')}
            </Button>
            {logo.data && (
              <Button variant="ghost" disabled={disabled || busy} onClick={() => remove.mutate()}>
                <Trash2 aria-hidden />
                {t('fields.logo.remove')}
              </Button>
            )}
          </div>
          {!logo.data && logo.isError ? (
            <ImageLoadFailed
              text={t('fields.logo.loadFailed')}
              onRetry={() => void logo.refetch()}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {logo.data || logo.isPending ? t('fields.logo.description') : t('fields.logo.none')}
            </p>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept={logoUpload.contentTypes.join(',')}
        aria-label={t('fields.logo.upload')}
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
