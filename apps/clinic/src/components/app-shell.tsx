import { PageContainer, ThemeToggle, VertexShifaMark } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The frame of every screen. "Powered by Vertex Shifa" is always visible (ADR 0018). The header,
 * the navigation and every page share one column (`PageContainer`), so their edges line up. The
 * signed-in member's controls sit before the theme toggle (`headerEnd`).
 */
export function AppShell({ children, headerEnd }: { children: ReactNode; headerEnd?: ReactNode }) {
  const { t } = useTranslation(['common', 'clinic']);
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex items-center gap-3 py-3">
          <VertexShifaMark className="w-7 text-primary" />
          <span className="text-lg font-bold">{t('productName')}</span>
          <span className="text-muted-foreground">{t('clinic:productLabel')}</span>
          <div className="ms-auto flex items-center gap-2">
            {headerEnd}
            <ThemeToggle labels={{ toDark: t('theme.toDark'), toLight: t('theme.toLight') }} />
          </div>
        </PageContainer>
      </header>
      <main className="flex-1 py-6">
        <PageContainer>{children}</PageContainer>
      </main>
      <footer className="border-t border-border">
        <PageContainer className="py-2 text-sm text-muted-foreground">
          {t('poweredBy')}
        </PageContainer>
      </footer>
    </div>
  );
}
