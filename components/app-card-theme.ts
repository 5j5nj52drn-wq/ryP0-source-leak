import type { RepoApp } from '../types/repo';

export type AppCardTheme = {
  bg: string;
  end: string;
  btn: string;
  nameMatch: string[];
};

// One source of truth for cards on the Apps page and inside the edit preview.
export const APP_CARD_THEMES: AppCardTheme[] = [
  { bg: '#7751AE', end: '#332052', btn: '#C4A2F7', nameMatch: ['amethyst', 'minecraft'] },
  { bg: '#A33D58', end: '#4B192A', btn: '#FF91A8', nameMatch: ['melonx', 'melon', 'yuzu', 'ryujinx'] },
  { bg: '#2669B8', end: '#153866', btn: '#82B7FF', nameMatch: ['dolphin', 'dolphinios'] },
  { bg: '#405C9A', end: '#1C294B', btn: '#91B5FF', nameMatch: ['ppsspp', 'psp'] },
  { bg: '#3266A7', end: '#17395F', btn: '#84C0FF', nameMatch: ['ipsx2', 'pcsx2', 'ps2'] },
  { bg: '#1E7770', end: '#103B39', btn: '#76E0D4', nameMatch: ['retroarch', 'emu'] },
  { bg: '#6152B8', end: '#2E2863', btn: '#B3A8FF', nameMatch: ['scarlet', 'sidestore', 'altstore'] },
  { bg: '#9B407F', end: '#4A1C40', btn: '#F7A2D5', nameMatch: ['movie', 'video', 'stream'] },
  { bg: '#46566E', end: '#212936', btn: '#AFC9EE', nameMatch: [] },
];

export function getAppCardTheme(app: RepoApp, index: number) {
  const name = app.name.toLowerCase();
  const bundleIdentifier = app.bundleIdentifier.toLowerCase();

  for (const theme of APP_CARD_THEMES) {
    if (theme.nameMatch.some((keyword) => name.includes(keyword) || bundleIdentifier.includes(keyword))) {
      return theme;
    }
  }

  if (app.tintColor?.match(/^#[0-9a-fA-F]{6}$/)) {
    return { bg: app.tintColor, end: '#1E293B', btn: '#C9E1FF', nameMatch: [] };
  }

  return APP_CARD_THEMES[index % APP_CARD_THEMES.length];
}
