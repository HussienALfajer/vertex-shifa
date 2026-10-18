import { Callout } from '@vertex-shifa/ui';
import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnline } from '../lib/online';

/** Shown on an online-only form while offline: saving is disabled, nothing is queued (S01). */
export function OfflineNotice() {
  const { t } = useTranslation('clinic');
  const online = useOnline();
  if (online) return null;
  return (
    <Callout
      role="status"
      tone="warning"
      icon={<WifiOff aria-hidden />}
      title={t('states.offlineTitle')}
      description={t('states.offlineNotice')}
    />
  );
}
