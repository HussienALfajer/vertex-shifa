import { formatLocale } from '@vertex-shifa/i18n';

/** Times are shown in Syria's time zone, whatever the computer's setting (ADR 0018). */
const timeZone = 'Asia/Damascus';

const dateTime = new Intl.DateTimeFormat(formatLocale, {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone,
});

/** A date and time from the API, in Arabic with Latin digits. */
export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
