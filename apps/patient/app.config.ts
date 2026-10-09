import { ar } from '@vertex-shifa/i18n';
import type { ExpoConfig } from 'expo/config';

// Store identifiers (bundle id, package name), EAS project and icons arrive with the first store
// build (ADR 0003, S19). The web export exists only for the E2E screenshots: no PWA (ADR 0003).
const config: ExpoConfig = {
  name: ar.common.productName,
  slug: 'vertex-shifa',
  scheme: 'vertexshifa',
  version: '0.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  platforms: ['android', 'ios', 'web'],
  web: { output: 'static', bundler: 'metro' },
  // Arabic right to left from the first launch, whatever the device language (ADR 0003, 0018):
  // read natively by expo-localization; src/lib/rtl.ts forces it again at start.
  extra: { supportsRTL: true, forcesRTL: true },
  plugins: [['expo-router', { sitemap: false }], 'expo-status-bar', 'expo-localization'],
};

export default config;
