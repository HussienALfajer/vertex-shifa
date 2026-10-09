import { useTranslation } from 'react-i18next';

/** The first screen; it gives way to tenants, contracts and billing in S22. */
export function HomeScreen() {
  const { t } = useTranslation('console');
  return (
    <section className="state">
      <h1 className="state-title">{t('home.title')}</h1>
      <p className="state-description">{t('home.description')}</p>
    </section>
  );
}
