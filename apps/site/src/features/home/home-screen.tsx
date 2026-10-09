import { i18n } from '../../lib/i18n';

/** The first page; clinic pages and booking arrive in Phase 5 with tenant subdomains. */
export function HomeScreen() {
  const t = i18n.getFixedT(null, 'site');
  return (
    <section className="state">
      <h1 className="state-title">{t('home.title')}</h1>
      <p className="state-description">{t('home.description')}</p>
    </section>
  );
}
