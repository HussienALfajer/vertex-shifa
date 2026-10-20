/** The interface language (ADR 0018): Arabic first, right to left. */
export const defaultLanguage = 'ar';

export const textDirection = 'rtl';

/**
 * The locale for `Intl` formatting: Syrian Arabic, so months read as in Syria (أيلول، تشرين الأول),
 * with Latin digits (`-u-nu-latn`), never Arabic-Indic digits (ADR 0018).
 */
export const formatLocale = 'ar-SY-u-nu-latn';

/** Times are shown in Syria's time zone, whatever the device's setting (ADR 0018). */
export const displayTimeZone = 'Asia/Damascus';

const date = new Intl.DateTimeFormat(formatLocale, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: displayTimeZone,
});

const time = new Intl.DateTimeFormat(formatLocale, {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: displayTimeZone,
});

/** A date and time in the one product style (brand/identity.md §9): "20 أيلول 2026، 1:00 م". */
export function formatDateTime(iso: string): string {
  const instant = new Date(iso);
  return `${date.format(instant)}، ${time.format(instant)}`;
}
