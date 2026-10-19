import { AppFrame } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { i18n } from '../lib/i18n';

/**
 * The frame of every page (`AppFrame` without a sidebar): the brand and the theme toggle in the top
 * bar, "Powered by Vertex Shifa" always visible (ADR 0018).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = i18n;
  return (
    <AppFrame
      labels={{
        productName: t('productName'),
        productLabel: t('site:productLabel'),
        poweredBy: t('poweredBy'),
        toDark: t('theme.toDark'),
        toLight: t('theme.toLight'),
        skipToContent: t('shell.skipToContent'),
        openNavigation: t('shell.openNavigation'),
        navigation: t('site:productLabel'),
      }}
    >
      {children}
    </AppFrame>
  );
}
