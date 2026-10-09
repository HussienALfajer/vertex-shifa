import { StateCard } from '../../components/state-card';
import { i18n } from '../../lib/i18n';

/** The first page; clinic pages and booking arrive in Phase 5 with tenant subdomains. */
export function HomeScreen() {
  const t = i18n.getFixedT(null, 'site');
  return <StateCard title={t('home.title')} description={t('home.description')} />;
}
