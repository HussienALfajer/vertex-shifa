import { Button } from '@vertex-shifa/ui';
import { useTranslation } from 'react-i18next';

/**
 * An optional image (a logo, a doctor's photo) whose read failed: said so, with a retry, never
 * shown as "no image", so nobody replaces an image that only failed to load.
 */
export function ImageLoadFailed({ text, onRetry }: { text: string; onRetry: () => void }) {
  const { t } = useTranslation('common');
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-text">
      <span>{text}</span>
      <Button variant="outline" size="sm" onClick={onRetry}>
        {t('retry')}
      </Button>
    </div>
  );
}
