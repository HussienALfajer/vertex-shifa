import {
  darkColors,
  fontSize,
  fontWeight,
  lightColors,
  radius,
  type SemanticColors,
  space,
} from '@vertex-shifa/tokens';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';

export interface Theme {
  scheme: 'light' | 'dark';
  colors: SemanticColors;
  space: typeof space;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
}

const scale = { space, radius, fontSize, fontWeight };
const light: Theme = { scheme: 'light', colors: lightColors, ...scale };
const dark: Theme = { scheme: 'dark', colors: darkColors, ...scale };

const ThemeContext = createContext<Theme>(light);

/**
 * Gives every screen the Vertex tokens of the device's light or dark scheme (brand/identity.md §2).
 * The web export is rendered ahead in light, and hydration keeps those styles, so on web the
 * scheme applies after mounting.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [mounted, setMounted] = useState(Platform.OS !== 'web');
  useEffect(() => setMounted(true), []);
  return (
    <ThemeContext.Provider value={mounted && scheme === 'dark' ? dark : light}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
