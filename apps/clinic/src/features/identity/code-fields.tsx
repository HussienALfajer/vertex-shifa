import { Field, FieldDescription, FieldError, FieldLabel, OtpField } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Arabic-Indic and Persian digits typed on an Arabic keyboard become Latin ones. */
function latinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => String((digit.charCodeAt(0) - 0x0660) % 0x0090));
}

type CodeFieldProps = {
  label: string;
  description?: ReactNode;
  error?: string | undefined;
  value: string;
  onValueChange: (value: string) => void;
  /** Runs when the sixth digit is typed or pasted. */
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** A PIN: the digits are masked. */
  mask?: boolean;
};

/**
 * Six digits: an OTP from WhatsApp, or a PIN (masked). Read left to right in every language
 * (`OtpField`).
 */
export function CodeField({
  label,
  description,
  error,
  value,
  onValueChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  mask = false,
}: CodeFieldProps) {
  const { t } = useTranslation('clinic');
  return (
    <Field invalid={error !== undefined} disabled={disabled} className="items-start">
      <FieldLabel>{label}</FieldLabel>
      <OtpField
        length={6}
        mask={mask}
        inputMode="numeric"
        validationType="numeric"
        normalizeValue={latinDigits}
        value={value}
        onValueChange={onValueChange}
        onValueComplete={onComplete}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={error !== undefined || undefined}
        slotLabel={(position) => t('identity.code.digit', { position })}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError match={error !== undefined}>{error}</FieldError>
    </Field>
  );
}
