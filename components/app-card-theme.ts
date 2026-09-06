import type { RepoApp } from '../types/repo';

export type AppCardTheme = {
  bg: string;
  btn: string;
  nameMatch: string[];
};

// One source of truth for cards on the Apps page and inside the edit preview.
export const APP_CARD_THEMES: AppCardTheme[] = [
  { bg: '#4A2D6E', btn: '#9B59D0', nameMatch: ['amethyst', 'minecraft'] },
  { bg: '#6B1E2E', btn: '#E05A6E', nameMatch: ['melonx', 'melon', 'yuzu', 'ryujinx'] },
  { bg: '#1A3A6E', btn: '#3B7DE8', nameMatch: ['dolphin', 'dolphinios'] },
  { bg: '#1E2D5A', btn: '#3B7DE8', nameMatch: ['ppsspp', 'psp'] },
  { bg: '#1A2D5E', btn: '#2563EB', nameMatch: ['ipsx2', 'pcsx2', 'ps2'] },
  { bg: '#134E4A', btn: '#14B8A6', nameMatch: ['retroarch', 'emu'] },
  { bg: '#312E81', btn: '#6366F1', nameMatch: ['scarlet', 'sidestore', 'altstore'] },
  { bg: '#701A75', btn: '#D946EF', nameMatch: ['movie', 'video', 'stream'] },
  { bg: '#1E293B', btn: '#38BDF8', nameMatch: [] },
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
    return { bg: app.tintColor, btn: '#3B82F6', nameMatch: [] };
  }

  return APP_CARD_THEMES[index % APP_CARD_THEMES.length];
}
