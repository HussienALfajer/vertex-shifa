import { useTranslation } from 'react-i18next';
import { StateCard } from '../../components/state-card';

/** The first screen; it gives way to the account, clinics and bookings in S19. */
export function HomeScreen() {
  const { t } = useTranslation('patient');
  return <StateCard title={t('home.title')} description={t('home.description')} />;
}
