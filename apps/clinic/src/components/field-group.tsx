import type { ReactNode } from 'react';

/** Controls that share one label (toggles, a logo's buttons, a list of phones): a fieldset. */
export function FieldGroup({
  legend,
  description,
  error,
  disabled,
  children,
}: {
  legend: string;
  description?: string | undefined;
  error?: string | undefined;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-foreground">{legend}</legend>
      {children}
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {error && <p className="text-sm text-destructive-text">{error}</p>}
    </fieldset>
  );
}
