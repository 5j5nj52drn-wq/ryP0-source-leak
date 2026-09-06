import { useColorScheme } from 'react-native';

export const ACCENT_COLORS = {
  blue: { label: 'Blue', value: '#007AFF' },
  purple: { label: 'Purple', value: '#AF52DE' },
  cyan: { label: 'Cyan', value: '#32ADE6' },
  red: { label: 'Red', value: '#FF3B30' },
  rose: { label: 'Rose', value: '#FF2D55' },
} as const;

export type AccentColor = keyof typeof ACCENT_COLORS;
export type AppearancePreference = 'system' | 'light' | 'dark';

const appThemes = {
  light: {
    background: '#F2F2F7',
    surface: '#FFFFFF',
    control: '#E5E5EA',
    input: '#F9F9FB',
    separator: '#E5E5EA',
    label: '#1C1C1E',
    secondaryLabel: '#6B7280',
  },
  dark: {
    background: '#000000',
    surface: '#1C1C1E',
    control: '#2C2C2E',
    input: '#2C2C2E',
    separator: '#3A3A3C',
    label: '#F2F2F7',
    secondaryLabel: '#98989F',
  },
} as const;

export function useAppTheme() {
  const colorScheme = useColorScheme();
  return appThemes[colorScheme === 'dark' ? 'dark' : 'light'];
}
