import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { type Area, isInServiceRegion } from '@vertex-shifa/contracts';
import {
  Button,
  Checkbox,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  LocationPicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type ShortLinkResult,
  Skeleton,
  Switch,
  Textarea,
} from '@vertex-shifa/ui';
import { Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import { useErrorText } from '../../lib/error-text';
import { defaultMapCenter, mapConfig } from '../../lib/map-config';
import { type DraftErrors, type FacilityDraft, isMobile } from './facility-draft';
import { areaQuery, areasQuery, resolveMapLink } from './queries';

type FieldsProps = {
  draft: FacilityDraft;
  onChange: (patch: Partial<FacilityDraft>) => void;
  errors: DraftErrors;
  disabled: boolean;
};

const MAX_PHONES = 3;

/**
 * Where the clinic is and how to reach it (step 2, branch settings): governorate and city, address
 * details, the map pin or a pasted link or coordinates (rule 13), and 1–3 contact phones.
 */
export function LocationFields({ draft, onChange, errors, disabled }: FieldsProps) {
  const { t } = useTranslation('clinic');
  const errorText = useErrorText();
  const outside = draft.coordinates !== undefined && !isInServiceRegion(draft.coordinates);
  const addressId = useId();

  async function resolveShortLink(url: string): Promise<ShortLinkResult> {
    try {
      return { coordinates: await resolveMapLink(url) };
    } catch (error) {
      return { error: errorText(error) };
    }
  }

  return (
    <>
      <AreaPickers draft={draft} onChange={onChange} errors={errors} disabled={disabled} />
      <Field invalid={errors.addressDetails !== undefined} disabled={disabled}>
        <FieldLabel htmlFor={addressId}>{t('fields.addressDetails.label')}</FieldLabel>
        <Textarea
          id={addressId}
          value={draft.addressDetails}
          onChange={(event) => onChange({ addressDetails: event.currentTarget.value })}
          maxLength={200}
          rows={2}
        />
        <FieldDescription>{t('fields.addressDetails.description')}</FieldDescription>
        <FieldError match={errors.addressDetails !== undefined}>
          {t('fields.addressDetails.invalid')}
        </FieldError>
      </Field>
      <FieldGroup
        legend={t('fields.location.label')}
        // The ODbL licence of the map data, as text: the app opens no outside links (ADR 0023).
        description={mapConfig ? t('fields.location.licence') : undefined}
        error={
          errors.coordinates && (!outside || draft.locationUnsettled)
            ? t(`fields.${errors.coordinates}` as 'fields.location.invalid')
            : undefined
        }
      >
        <LocationPicker
          map={mapConfig}
          center={defaultMapCenter}
          value={draft.coordinates}
          onChange={(coordinates) => onChange({ coordinates, outsideConfirmed: false })}
          onSettledChange={(settled) => onChange({ locationUnsettled: !settled })}
          resolveShortLink={resolveShortLink}
          disabled={disabled}
          labels={{
            map: t('fields.location.map'),
            pin: t('fields.location.pin'),
            paste: t('fields.location.paste'),
            pasteDescription: t('fields.location.pasteDescription'),
            resolving: t('fields.location.resolving'),
            unrecognized: t('fields.location.unrecognized'),
          }}
        />
        {outside && (
          // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's checkbox renders the control inside the label.
          <label className="flex items-center gap-2 text-sm text-status-warning-foreground">
            <Checkbox
              checked={draft.outsideConfirmed}
              onCheckedChange={(outsideConfirmed) => onChange({ outsideConfirmed })}
              disabled={disabled}
            />
            <span>
              {t('fields.location.outside')} {t('fields.location.confirmOutside')}
            </span>
          </label>
        )}
      </FieldGroup>
      <PhoneFields draft={draft} onChange={onChange} errors={errors} disabled={disabled} />
    </>
  );
}

/**
 * Governorate, then city. Archived cities leave the list, but a branch that references one keeps
 * showing it (edge case 4).
 */
function AreaPickers({ draft, onChange, errors, disabled }: FieldsProps) {
  const { t } = useTranslation('clinic');
  const governorates = useQuery(areasQuery(undefined));
  const cities = useQuery({ ...areasQuery(draft.governorateId), enabled: !!draft.governorateId });
  const current = useQuery({ ...areaQuery(draft.areaId ?? ''), enabled: !!draft.areaId });

  const cityOptions: Area[] = [...(cities.data ?? [])];
  if (
    current.data &&
    current.data.parentId === draft.governorateId &&
    !cityOptions.some((city) => city.id === current.data.id)
  ) {
    cityOptions.push(current.data);
  }
  const cityLabel = (city: Area) =>
    city.archivedAt ? t('fields.city.archived', { name: city.nameAr }) : city.nameAr;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field disabled={disabled}>
        <FieldLabel>{t('fields.governorate.label')}</FieldLabel>
        {governorates.data ? (
          <Select
            value={draft.governorateId ?? null}
            onValueChange={(governorateId) => {
              if (governorateId && governorateId !== draft.governorateId) {
                onChange({ governorateId, areaId: undefined });
              }
            }}
            items={governorates.data.map((area) => ({ value: area.id, label: area.nameAr }))}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('fields.governorate.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {governorates.data.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {area.nameAr}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <AreaListPending query={governorates} />
        )}
      </Field>
      <Field invalid={errors.areaId !== undefined} disabled={disabled}>
        <FieldLabel>{t('fields.city.label')}</FieldLabel>
        {draft.governorateId && !cities.data ? (
          <AreaListPending query={cities} />
        ) : (
          <Select
            value={draft.areaId ?? null}
            onValueChange={(areaId) => areaId && onChange({ areaId })}
            items={cityOptions.map((city) => ({ value: city.id, label: cityLabel(city) }))}
            disabled={disabled || !draft.governorateId}
          >
            <SelectTrigger>
              <SelectValue placeholder={t('fields.city.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {cityOptions.map((city) => (
                <SelectItem key={city.id} value={city.id} disabled={city.archivedAt !== null}>
                  {cityLabel(city)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <FieldDescription>{t('fields.city.description')}</FieldDescription>
        <FieldError match={errors.areaId !== undefined}>{t('fields.city.invalid')}</FieldError>
      </Field>
    </div>
  );
}

/**
 * A picker's list before it is there: loading, or its load failed, with a retry that keeps the
 * rest of the form.
 */
function AreaListPending({ query }: { query: UseQueryResult<Area[]> }) {
  const { t } = useTranslation(['clinic', 'common']);
  const errorText = useErrorText();
  if (!query.isError) return <Skeleton className="h-9" />;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-text">
      <span>
        {t('clinic:states.areasFailed')} {errorText(query.error)}
      </span>
      <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
        {t('common:retry')}
      </Button>
    </div>
  );
}

/** 1–3 numbers; WhatsApp only on mobile numbers (the contract refuses it on landlines). */
function PhoneFields({ draft, onChange, errors, disabled }: FieldsProps) {
  const { t } = useTranslation('clinic');
  const setPhone = (index: number, patch: Partial<FacilityDraft['phones'][number]>) =>
    onChange({
      phones: draft.phones.map((entry, at) => (at === index ? { ...entry, ...patch } : entry)),
    });

  return (
    <FieldGroup legend={t('fields.phones.label')} description={t('fields.phones.description')}>
      {draft.phones.map((entry, index) => {
        const error = errors[`phones.${index}`];
        const number = index + 1;
        return (
          // Phones have no id of their own; their position is their identity in this form.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <div key={index} className="flex flex-wrap items-start gap-3">
            <Field invalid={error !== undefined} disabled={disabled} className="min-w-56 flex-1">
              <FieldLabel>{t('fields.phones.phone', { number })}</FieldLabel>
              <Input
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                value={entry.phone}
                onValueChange={(phone) => setPhone(index, { phone })}
              />
              <FieldError match={error !== undefined}>
                {error && t(`fields.${error}` as 'fields.phones.invalid')}
              </FieldError>
            </Field>
            {isMobile(entry.phone) && (
              // biome-ignore lint/a11y/noLabelWithoutControl: Base UI's switch renders the control inside the label.
              <label className="mt-8 flex items-center gap-2 text-sm">
                <Switch
                  checked={entry.whatsapp}
                  onCheckedChange={(whatsapp) => setPhone(index, { whatsapp })}
                  disabled={disabled}
                />
                {t('fields.phones.whatsapp')}
              </label>
            )}
            {draft.phones.length > 1 && (
              <IconButton
                className="mt-7"
                variant="ghost"
                label={t('fields.phones.remove', { number })}
                disabled={disabled}
                onClick={() => onChange({ phones: draft.phones.filter((_, at) => at !== index) })}
              >
                <Trash2 />
              </IconButton>
            )}
          </div>
        );
      })}
      {draft.phones.length < MAX_PHONES && (
        <Button
          variant="outline"
          className="w-fit"
          disabled={disabled}
          onClick={() => onChange({ phones: [...draft.phones, { phone: '', whatsapp: false }] })}
        >
          <Plus aria-hidden />
          {t('fields.phones.add')}
        </Button>
      )}
    </FieldGroup>
  );
}
