import { AppFrame, AuthFrame } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

function useFrameLabels() {
  const { t } = useTranslation(['common', 'console']);
  return {
    productName: t('productName'),
    productLabel: t('console:productLabel'),
    poweredBy: t('poweredBy'),
    toDark: t('theme.toDark'),
    toLight: t('theme.toLight'),
  };
}

/**
 * The frame of every screen of a signed-in platform user (`AppFrame`): the console's navigation in the
 * sidebar (a sheet on narrow windows), the user's controls in the top bar (`headerEnd`).
 * "Powered by Vertex Shifa" is always visible (ADR 0018).
 */
export function AppShell({
  children,
  navigation,
  headerEnd,
}: {
  children: ReactNode;
  navigation?: ReactNode;
  headerEnd?: ReactNode;
}) {
  const { t } = useTranslation(['common', 'console']);
  return (
    <AppFrame
      labels={{
        ...useFrameLabels(),
        skipToContent: t('shell.skipToContent'),
        openNavigation: t('shell.openNavigation'),
        navigation: t('console:nav.label'),
      }}
      navigation={navigation}
      headerEnd={headerEnd}
    >
      {children}
    </AppFrame>
  );
}

/** The frame of the sign-in, and of the states before a session is known. */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('console');
  return <AuthFrame labels={{ ...useFrameLabels(), tagline: t('tagline') }}>{children}</AuthFrame>;
}
