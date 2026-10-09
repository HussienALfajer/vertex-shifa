import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

// Local colors and spacing until the brand phase brings packages/tokens and packages/ui-native
// (ADR 0018), which replace this file. They copy apps/console/src/styles.css.

const light = {
  background: '#f6f7f9',
  surface: '#ffffff',
  text: '#1a1f24',
  textMuted: '#5a6470',
  border: '#dde1e6',
  accent: '#0b6e6e',
  onAccent: '#ffffff',
};

export type Colors = typeof light;

const dark: Colors = {
  background: '#12161a',
  surface: '#1b2127',
  text: '#e8ecef',
  textMuted: '#9aa5b0',
  border: '#2d353d',
  accent: '#4cc3c3',
  onAccent: '#0b1a1a',
};

export const space = { 2: 8, 3: 12, 4: 16, 6: 24 } as const;

export const radius = 8;

const ColorsContext = createContext<Colors>(light);

/**
 * Gives every screen the colors of the device's light or dark scheme. The web export is rendered
 * ahead in light, and hydration keeps those styles, so on web the scheme applies after mounting.
 */
export function ColorsProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [mounted, setMounted] = useState(Platform.OS !== 'web');
  useEffect(() => setMounted(true), []);
  return (
    <ColorsContext.Provider value={mounted && scheme === 'dark' ? dark : light}>
      {children}
    </ColorsContext.Provider>
  );
}

export function useColors(): Colors {
  return useContext(ColorsContext);
}
