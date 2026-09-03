import { DefaultTheme as NavigationDefaultTheme } from '@react-navigation/native';
import type { Theme as NavigationTheme } from '@react-navigation/native';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

/**
 * Wiro's own tint on Material 3 roles — the palette stays fixed in
 * both appearances instead of following per-device dynamic color,
 * so the app looks like the brand everywhere. Values are the
 * `--wiro-*` tokens wiro.ai ships (light / dark pairs), so a screen
 * here reads like a page there.
 */
const AppColors = {
  background: '#F9F8F5',
  backgroundWarm: '#F2EFE8',
  backgroundStone: '#EDEAE2',
  surface: '#FFFFFF',

  ink: '#16140F',
  inkMuted: '#706C62',
  inkDisabled: '#A8A49A',

  green: '#2E7D52',
  greenMid: '#3A9463',
  greenBright: '#4CAF76',
  greenText: '#1E5C38',
  greenContainer: '#EAF2ED',

  danger: '#C05050',
  dangerText: '#B3471E',
  dangerContainer: '#F5ECE7',

  darkBackground: '#12100D',
  darkBackgroundWarm: '#191713',
  darkSurface: '#1E1C16',
  darkBackgroundStone: '#211F19',
  darkSurfaceHigh: '#2B2921',
  onDark: '#F7F3EA',
  onDarkMuted: '#AAA297',
  onDarkDisabled: '#7B776C',
  greenOnDark: '#4CAF76',
  greenTextOnDark: '#80D8A2',
  greenDarkContainer: '#1E4530',
  dangerOnDark: '#D9776B',
  dangerTextOnDark: '#E08960',
  dangerDarkContainer: '#432622',
} as const;

/**
 * Paper draws the navigation bar, elevated app bars, menus, and
 * tinted surfaces from these levels. Material's defaults tint
 * toward its purple baseline primary; Wiro's surfaces step through
 * the site's warm neutrals instead, so chrome and page agree.
 */
const lightElevation = {
  level0: 'transparent',
  level1: AppColors.background,
  level2: AppColors.backgroundWarm,
  level3: AppColors.backgroundStone,
  level4: '#E8E4DA',
  level5: '#E3DED3',
} as const;

const darkElevation = {
  level0: 'transparent',
  level1: AppColors.darkBackgroundWarm,
  level2: AppColors.darkSurface,
  level3: AppColors.darkBackgroundStone,
  level4: '#26231C',
  level5: AppColors.darkSurfaceHigh,
} as const;

export const wiroLightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    elevation: lightElevation,
    primary: AppColors.green,
    onPrimary: '#FFFFFF',
    primaryContainer: AppColors.greenContainer,
    onPrimaryContainer: AppColors.greenText,
    secondary: AppColors.greenMid,
    onSecondary: '#FFFFFF',
    secondaryContainer: AppColors.greenContainer,
    onSecondaryContainer: AppColors.greenText,
    background: AppColors.background,
    onBackground: AppColors.ink,
    surface: AppColors.surface,
    onSurface: AppColors.ink,
    surfaceVariant: AppColors.backgroundStone,
    onSurfaceVariant: AppColors.inkMuted,
    outline: AppColors.inkDisabled,
    outlineVariant: AppColors.backgroundStone,
    error: AppColors.danger,
    onError: '#FFFFFF',
    errorContainer: AppColors.dangerContainer,
    onErrorContainer: AppColors.dangerText,
    inverseSurface: AppColors.darkSurface,
    inverseOnSurface: AppColors.onDark,
    inversePrimary: AppColors.greenBright,
  },
};

export const wiroDarkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    elevation: darkElevation,
    primary: AppColors.greenOnDark,
    onPrimary: AppColors.darkBackground,
    primaryContainer: AppColors.greenDarkContainer,
    onPrimaryContainer: AppColors.greenTextOnDark,
    secondary: AppColors.greenTextOnDark,
    onSecondary: AppColors.darkBackground,
    secondaryContainer: AppColors.greenDarkContainer,
    onSecondaryContainer: AppColors.greenTextOnDark,
    background: AppColors.darkBackground,
    onBackground: AppColors.onDark,
    surface: AppColors.darkSurface,
    onSurface: AppColors.onDark,
    surfaceVariant: AppColors.darkBackgroundStone,
    onSurfaceVariant: AppColors.onDarkMuted,
    outline: AppColors.onDarkDisabled,
    outlineVariant: AppColors.darkSurfaceHigh,
    error: AppColors.dangerOnDark,
    onError: AppColors.darkBackground,
    errorContainer: AppColors.dangerDarkContainer,
    onErrorContainer: AppColors.dangerTextOnDark,
    inverseSurface: AppColors.surface,
    inverseOnSurface: AppColors.ink,
    inversePrimary: AppColors.green,
  },
};

export function wiroTheme(colorScheme: 'light' | 'dark' | null | undefined): MD3Theme {
  return colorScheme === 'dark' ? wiroDarkTheme : wiroLightTheme;
}

/**
 * Carries the same Wiro palette into `NavigationContainer`, whose
 * chrome (screen background between renders) is unrelated to
 * Paper. Only the colors this shape has room for translate.
 */
export function wiroNavigationTheme(theme: MD3Theme): NavigationTheme {
  return {
    ...NavigationDefaultTheme,
    dark: theme.dark,
    colors: {
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.onBackground,
      border: theme.colors.outlineVariant,
      notification: theme.colors.error,
    },
  };
}
