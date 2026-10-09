import { defaultLanguage, textDirection } from '@vertex-shifa/i18n';
import { DirectionProvider } from '@vertex-shifa/ui';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import favicon from '../../../../brand/logo/svg/favicon.svg';
import { AppShell } from '../components/app-shell';
import { i18n } from '../lib/i18n';
import '../styles.css';

export const metadata: Metadata = { title: i18n.t('productName'), icons: favicon.src };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLanguage} dir={textDirection}>
      <body>
        <DirectionProvider direction={textDirection}>
          <AppShell>{children}</AppShell>
        </DirectionProvider>
      </body>
    </html>
  );
}
