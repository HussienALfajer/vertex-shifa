import { Button } from '@vertex-shifa/ui';
import { useTranslation } from 'react-i18next';
import { StateCard } from './state-card';

/**
 * The screen of an unexpected error. It never shows or logs the error itself: its message may
 * carry patient data (ADR 0016).
 */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <StateCard
      role="alert"
      title={t('errorTitle')}
      description={t('errorDescription')}
      action={<Button onClick={onRetry}>{t('retry')}</Button>}
    />
  );
}
