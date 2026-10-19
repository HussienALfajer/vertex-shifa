import { useNavigate } from '@tanstack/react-router';
import { Button, Card, CardDescription, CardHeader, CardTitle, PageHeader } from '@vertex-shifa/ui';
import { MonitorSmartphoneIcon, UserRoundPlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { OfflineNotice } from '../../components/offline-notice';
import { useOnline } from '../../lib/online';

/** `/welcome` (screen 1): an installation not registered to any clinic yet. */
export function WelcomeScreen() {
  const { t } = useTranslation('clinic');
  const online = useOnline();
  const navigate = useNavigate();
  return (
    <section className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        title={t('identity.welcome.title')}
        description={t('identity.welcome.description')}
      />
      <OfflineNotice description={t('identity.offline.signIn')} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MonitorSmartphoneIcon aria-hidden="true" className="size-5 text-primary" />
            {t('identity.welcome.registerTitle')}
          </CardTitle>
          <CardDescription>{t('identity.welcome.registerDescription')}</CardDescription>
        </CardHeader>
        <div className="ps-4 pb-4">
          <Button
            disabled={!online}
            onClick={() => void navigate({ to: '/sign-in', search: { purpose: 'register' } })}
          >
            {t('identity.welcome.register')}
          </Button>
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRoundPlusIcon aria-hidden="true" className="size-5 text-primary" />
            {t('identity.welcome.firstTitle')}
          </CardTitle>
          <CardDescription>{t('identity.welcome.firstDescription')}</CardDescription>
        </CardHeader>
        <div className="ps-4 pb-4">
          <Button
            variant="outline"
            disabled={!online}
            onClick={() =>
              void navigate({ to: '/sign-in', search: { purpose: 'register', first: true } })
            }
          >
            {t('identity.welcome.first')}
          </Button>
        </div>
      </Card>
    </section>
  );
}
