import { VertexShifaMark } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { i18n } from '../lib/i18n';

/** The frame of every page. "Powered by Vertex Shifa" is always visible (ADR 0018). */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = i18n;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-6 py-3">
        <VertexShifaMark className="w-7 text-primary" />
        <span className="text-lg font-bold">{t('productName')}</span>
        <span className="text-muted-foreground">{t('site:productLabel')}</span>
      </header>
      <main className="flex-1 p-6">{children}</main>
      <footer className="border-t border-border px-6 py-2 text-sm text-muted-foreground">
        {t('poweredBy')}
      </footer>
    </div>
  );
}
