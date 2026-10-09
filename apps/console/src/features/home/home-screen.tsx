import { useTranslation } from 'react-i18next';
import { StateCard } from '../../components/state-card';

/** The first screen; it gives way to tenants, contracts and billing in S22. */
export function HomeScreen() {
  const { t } = useTranslation('console');
  return <StateCard title={t('home.title')} description={t('home.description')} />;
}
