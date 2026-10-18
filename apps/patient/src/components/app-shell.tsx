import { ThemeToggle, useTheme } from '@vertex-shifa/ui-native';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** The frame of every screen. "Vertex Shifa" is always visible (ADR 0018). */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { scheme, colors, space, fontSize, fontWeight } = useTheme();
  return (
    <SafeAreaView style={[styles.shell, { backgroundColor: colors.background }]}>
      {/* The status bar follows the theme drawn, not only the system's setting. */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <View
        role="banner"
        style={[
          styles.header,
          {
            gap: space[3],
            paddingBlock: space[3],
            paddingInline: space[6],
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text
          style={{
            color: colors.foreground,
            fontSize: fontSize.lg.size,
            lineHeight: fontSize.lg.lineHeight,
            fontWeight: fontWeight.bold,
          }}
        >
          {t('productName')}
        </Text>
        <ThemeToggle labels={{ toDark: t('theme.toDark'), toLight: t('theme.toLight') }} />
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <ScrollView role="main" contentContainerStyle={[styles.main, { padding: space[6] }]}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1 },
  // The product name at the start, the theme button at the end.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  divider: { height: StyleSheet.hairlineWidth },
  main: { flexGrow: 1 },
});
