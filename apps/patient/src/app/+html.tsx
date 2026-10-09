import { defaultLanguage, textDirection } from '@vertex-shifa/i18n';
import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

/** The HTML document of the web export, which exists only for the E2E screenshots (ADR 0003). */
export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang={defaultLanguage} dir={textDirection}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
