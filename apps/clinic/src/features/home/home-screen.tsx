import { useTranslation } from 'react-i18next';

/** The first screen; it gives way to the clinic's day (appointments and queue) in Phase 2. */
export function HomeScreen() {
  const { t } = useTranslation('clinic');
  return (
    <section className="state">
      <h1 className="state-title">{t('home.title')}</h1>
      <p className="state-description">{t('home.description')}</p>
    </section>
  );
}
