import { AppFrame, AuthFrame } from '@vertex-shifa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

function useFrameLabels() {
  const { t } = useTranslation(['common', 'clinic']);
  return {
    productName: t('productName'),
    productLabel: t('clinic:productLabel'),
    poweredBy: t('poweredBy'),
    toDark: t('theme.toDark'),
    toLight: t('theme.toLight'),
  };
}

/**
 * The frame of every screen of a signed-in member (`AppFrame`): the clinic's navigation in the
 * sidebar (a sheet on narrow windows), the member's controls in the top bar (`headerEnd`).
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
  const { t } = useTranslation(['common', 'clinic']);
  return (
    <AppFrame
      labels={{
        ...useFrameLabels(),
        skipToContent: t('shell.skipToContent'),
        openNavigation: t('shell.openNavigation'),
        navigation: t('clinic:nav.label'),
      }}
      navigation={navigation}
      headerEnd={headerEnd}
    >
      {children}
    </AppFrame>
  );
}

/** The frame of the screens before a member is signed in (S02 screens 1–5), and of the gate. */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation('clinic');
  return <AuthFrame labels={{ ...useFrameLabels(), tagline: t('tagline') }}>{children}</AuthFrame>;
}
