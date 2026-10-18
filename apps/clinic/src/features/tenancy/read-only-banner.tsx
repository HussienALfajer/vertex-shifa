import type { Tenant } from '@vertex-shifa/contracts';
import { Callout } from '@vertex-shifa/ui';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * App-wide while the clinic is suspended or closed (S01 screen 7): read-only, with the reason's
 * category only, never Vertex staff's free text (ADR 0013).
 */
export function ReadOnlyBanner({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation('clinic');
  if (tenant.status !== 'suspended' && tenant.status !== 'closed') return null;
  return (
    <Callout
      role="status"
      tone="danger"
      icon={<Lock aria-hidden />}
      title={t('readOnly.title')}
      description={
        <span className="flex flex-col gap-1">
          <span>{t(`readOnly.${tenant.status}`)}</span>
          <span>{t(`readOnly.reason.${tenant.statusReason ?? 'other'}`)}</span>
          <span>{t('readOnly.contact')}</span>
        </span>
      }
    />
  );
}
