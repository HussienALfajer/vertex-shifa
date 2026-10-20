'use client';

import { OTPField as OTPFieldPrimitive } from '@base-ui/react/otp-field';
import { Fragment } from 'react';
import { cn } from '../lib/cn';

type OtpFieldProps = Omit<OTPFieldPrimitive.Root.Props, 'length'> & {
  length?: number;
  /** Accessible name of each slot after the first, e.g. "Digit 2". */
  slotLabel: (position: number) => string;
};

/**
 * One-time code slots (two-factor sign-in). Codes read left to right in every language, so the
 * slots are laid out LTR; the middle gap groups a 6-digit code as 3 + 3. The slots share the
 * row's width up to 44 px each, so the row fits a 320 px phone. `autoFocus` focuses the first slot
 * (on the root it would do nothing).
 */
function OtpField({ length = 6, slotLabel, className, autoFocus, ...props }: OtpFieldProps) {
  const middle = length % 2 === 0 ? length / 2 : -1;
  const positions = Array.from({ length }, (_, index) => index);
  return (
    <OTPFieldPrimitive.Root
      data-slot="otp-field"
      dir="ltr"
      length={length}
      className={cn('flex w-full max-w-81 items-center justify-center gap-1 sm:gap-2', className)}
      {...props}
    >
      {positions.map((position) => (
        <Fragment key={position}>
          {position === middle && (
            <OTPFieldPrimitive.Separator
              aria-hidden="true"
              className="h-0.5 w-2 shrink-0 sm:w-3 rounded-sm bg-border"
            />
          )}
          <OTPFieldPrimitive.Input
            autoFocus={autoFocus && position === 0}
            aria-label={position === 0 ? undefined : slotLabel(position + 1)}
            className={cn(
              'h-12 min-w-0 max-w-11 flex-1 rounded-md border border-input bg-surface text-center text-xl font-medium tabular-nums text-foreground',
              'transition-colors duration-150 ease-out focus:border-primary',
              'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive-text',
            )}
          />
        </Fragment>
      ))}
    </OTPFieldPrimitive.Root>
  );
}

export { OtpField, type OtpFieldProps };
