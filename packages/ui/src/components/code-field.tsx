'use client';

import type { ReactNode } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from './field';
import { OtpField } from './otp-field';

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
  /** Accessible name of each slot after the first, e.g. "Digit 2". */
  slotLabel: (position: number) => string;
};

/**
 * Six digits in a form row: a one-time code (WhatsApp OTP, TOTP) or a PIN (masked). Read left to
 * right in every language (`OtpField`); Arabic-Indic digits are taken as Latin ones.
 */
function CodeField({
  label,
  description,
  error,
  value,
  onValueChange,
  onComplete,
  disabled = false,
  autoFocus = false,
  mask = false,
  slotLabel,
}: CodeFieldProps) {
  return (
    // `data-slot="field"` from `Field`: the row is a field like any other.
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
        slotLabel={slotLabel}
      />
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldError match={error !== undefined}>{error}</FieldError>
    </Field>
  );
}

export { CodeField, type CodeFieldProps, latinDigits };
