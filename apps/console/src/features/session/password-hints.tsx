import { isWeakPassword, passwordPolicy } from '@vertex-shifa/contracts';
import { CheckIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Rule 11: what makes a password acceptable, as the API checks it. */
export function passwordHints(password: string, phone: string) {
  return {
    length: password.length >= passwordPolicy.minLength,
    common: password.length > 0 && !isWeakPassword(password, phone),
  };
}

/** The password rules as a checklist that follows the typing. */
export function PasswordHints({ hints }: { hints: { length: boolean; common: boolean } }) {
  const { t } = useTranslation('console');
  const items = [
    {
      met: hints.length,
      text: t('password.hintLength', { min: passwordPolicy.minLength }),
    },
    { met: hints.common, text: t('password.hintCommon') },
  ];
  return (
    <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
      {items.map((item) => (
        <li
          key={item.text}
          className={
            item.met
              ? 'flex items-center gap-2 text-foreground'
              : 'flex items-center gap-2 text-muted-foreground'
          }
        >
          {item.met ? (
            <CheckIcon aria-hidden="true" className="size-4 text-primary" />
          ) : (
            <XIcon aria-hidden="true" className="size-4" />
          )}
          <span>
            <span className="sr-only">{item.met ? t('password.met') : t('password.notMet')}</span>
            {item.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
