import {
  type CurrencyCode,
  currencies,
  type DisplayNameFormat,
  weekdays,
  workingDaysFromList,
  workingDaysToList,
} from '@vertex-shifa/contracts';
import { Switch, ToggleGroup, ToggleGroupItem } from '@vertex-shifa/ui';
import { useTranslation } from 'react-i18next';
import { FieldGroup } from '../../components/field-group';
import type { DraftErrors, FacilityDraft } from './facility-draft';

type FieldsProps = {
  draft: FacilityDraft;
  onChange: (patch: Partial<FacilityDraft>) => void;
  errors: DraftErrors;
  disabled: boolean;
};

const currencyCodes = Object.keys(currencies) as CurrencyCode[];

/** Working days, Saturday first (rule 11), and the default currency (rule 10): step 3. */
export function WeekFields({ draft, onChange, errors, disabled }: FieldsProps) {
  const { t } = useTranslation('clinic');
  return (
    <>
      <FieldGroup
        legend={t('fields.workingDays.label')}
        description={t('fields.workingDays.description')}
        error={errors.workingDays && t('fields.workingDays.invalid')}
      >
        <ToggleGroup
          multiple
          aria-label={t('fields.workingDays.label')}
          className="flex-wrap"
          value={workingDaysToList(draft.workingDays)}
          onValueChange={(days) => onChange({ workingDays: workingDaysFromList(days) })}
          disabled={disabled}
        >
          {weekdays.map((day) => (
            <ToggleGroupItem key={day} value={day}>
              {t(`weekdays.${day}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldGroup>
      <FieldGroup
        legend={t('fields.currency.label')}
        description={t('fields.currency.description')}
        error={errors.defaultCurrency && t('fields.currency.invalid')}
      >
        <ToggleGroup
          aria-label={t('fields.currency.label')}
          className="flex-wrap"
          value={draft.defaultCurrency ? [draft.defaultCurrency] : []}
          // A choice between three: pressing the chosen one again keeps it.
          onValueChange={([defaultCurrency]) => defaultCurrency && onChange({ defaultCurrency })}
          disabled={disabled}
        >
          {currencyCodes.map((code) => (
            <ToggleGroupItem key={code} value={code}>
              {t(`currencies.${code}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </FieldGroup>
    </>
  );
}

const nameFormats: DisplayNameFormat[] = ['ticket_only', 'first_name_father_initial'];

/**
 * The waiting-room display (step 4): the ticket number only (default) or the first name and the
 * father's initial, never the full name or anything medical (rule 12); and the call sound.
 */
export function DisplayFields({ draft, onChange, disabled }: Omit<FieldsProps, 'errors'>) {
  const { t } = useTranslation('clinic');
  return (
    <>
      <FieldGroup
        legend={t('fields.displayNameFormat.label')}
        description={t('fields.displayNameFormat.description')}
      >
        <ToggleGroup
          aria-label={t('fields.displayNameFormat.label')}
          className="flex-wrap"
          value={[draft.displayNameFormat]}
          onValueChange={([displayNameFormat]) =>
            displayNameFormat && onChange({ displayNameFormat })
          }
          disabled={disabled}
        >
          {nameFormats.map((format) => (
            <ToggleGroupItem key={format} value={format}>
              {t(`fields.displayNameFormat.${format}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-base font-medium">
          {t(`fields.displayNameFormat.sample_${draft.displayNameFormat}`)}
        </p>
      </FieldGroup>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: Base UI's switch renders the control inside the label. */}
      <label className="flex items-start gap-3">
        <Switch
          checked={draft.displayCallSound}
          onCheckedChange={(displayCallSound) => onChange({ displayCallSound })}
          disabled={disabled}
        />
        <span className="flex flex-col gap-1">
          <span className="text-sm font-medium">{t('fields.displayCallSound.label')}</span>
          <span className="text-sm text-muted-foreground">
            {t('fields.displayCallSound.description')}
          </span>
        </span>
      </label>
    </>
  );
}
