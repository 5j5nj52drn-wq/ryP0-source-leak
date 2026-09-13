import type { RepoApp } from '../types/repo';
import type { AppCardTheme } from './app-card-theme';

export interface AppCardVisualProps {
  app: RepoApp;
  latestVersionLabel: string;
  subtitle: string;
  theme: AppCardTheme;
  typeLabel: string;
  statusLabel: string;
  statusColor: string;
  statusSymbol: string;
  preview?: boolean;
  fixedWidth?: number;
}

export const APP_CARD_HEIGHT = 136;
