import { useTranslation } from 'react-i18next';
import { StateCard } from '../../components/state-card';

/** The first screen; it gives way to the clinic's day (appointments and queue) in Phase 2. */
export function HomeScreen() {
  const { t } = useTranslation('clinic');
  return <StateCard title={t('home.title')} description={t('home.description')} />;
}
