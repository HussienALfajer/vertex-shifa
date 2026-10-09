import { useTheme } from '@vertex-shifa/ui-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** The frame of every screen. "Vertex Shifa" is always visible (ADR 0018). */
export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { colors, space, fontSize, fontWeight } = useTheme();
  return (
    <SafeAreaView style={[styles.shell, { backgroundColor: colors.background }]}>
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
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  divider: { height: StyleSheet.hairlineWidth },
  main: { flexGrow: 1 },
});
