import { VertexShifaMark } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** The frame of every screen. "Powered by Vertex Shifa" is always visible (ADR 0018). */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation(['common', 'clinic']);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <VertexShifaMark className="w-7 text-primary" />
        <span className="text-lg font-bold">{t('productName')}</span>
        <span className="text-muted-foreground">{t('clinic:productLabel')}</span>
      </header>
      <main className="flex-1 p-6">{children}</main>
      <footer className="border-t border-border px-6 py-2 text-sm text-muted-foreground">
        {t('poweredBy')}
      </footer>
    </div>
  );
}
