import { create } from 'zustand';
import { RepoData, RepoApp, RepoAppStatus } from '../types/repo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Appearance } from 'react-native';
import {
  AccentColor,
  AppearancePreference,
} from '../theme/app-preferences';
import {
  fetchRepositoryIcons,
  fetchRepositorySnapshot,
  githubErrorMessage,
  GitHubApiError,
  renameRepositoryIcon,
  updateRepositoryFile,
  uploadRepositoryIcon,
  validateGitHubToken,
  ValidatedGitHubAccount,
} from '../services/github-api';
import {
  getAppStatusKey,
  verifyRepositoryAppStatuses,
} from '../services/app-status';
import {
  CredentialProtectionStatus,
  deleteStoredGitHubToken,
  getCredentialProtectionStatus,
  getStoredGitHubToken,
  storeGitHubToken,
} from '../services/secure-credentials';
import { requireSafeExternalHttpsUrl } from '../services/safe-url';
import { isAdminBuild } from '../services/build-variant';

export interface GithubFile {
  name: string;
  displayName?: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string;
  type: string;
}

interface RepoState {
  repo: RepoData | null;
  repoSha: string | null;
  isLoading: boolean;
  error: string | null;
  hasGitHubCredential: boolean;
  githubLogin: string | null;
  isDeveloperMode: boolean;
  isAuthenticating: boolean;
  authError: string | null;
  credentialProtection: CredentialProtectionStatus | null;
  isInitialized: boolean;
  iconsList: GithubFile[];
  runtimeAppStatuses: Record<string, RepoAppStatus>;
  pendingIconSelection: string | null;
  isSearchOpen: boolean;
  searchQuery: string;
  appearancePreference: AppearancePreference;
  accentColor: AccentColor;

  // Actions
  initializeStore: () => Promise<void>;
  setGithubToken: (token: string) => Promise<ValidatedGitHubAccount | null>;
  setIsSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
  setAppearancePreference: (preference: AppearancePreference) => Promise<void>;
  setAccentColor: (accentColor: AccentColor) => Promise<void>;
  fetchRepo: () => Promise<void>;
  reorderApps: (apps: RepoApp[]) => void;
  updateApp: (index: number, app: RepoApp) => void;
  deleteApp: (bundleIdentifier: string) => void;
  duplicateApp: (bundleIdentifier: string, newApp: RepoApp) => void;
  commitChanges: () => Promise<void>;
  fetchIcons: () => Promise<void>;
  uploadIcon: (base64Data: string, filename: string) => Promise<string>;
  renameIcon: (filename: string, displayName: string) => Promise<void>;
  setPendingIconSelection: (url: string | null) => void;
  installApp: (app: RepoApp) => Promise<void>;
}

const LEGACY_TOKEN_KEY = '@github_pat';
const APPEARANCE_PREFERENCE_KEY = '@appearance_preference';
const ACCENT_COLOR_KEY = '@accent_color';

let initializationPromise: Promise<void> | null = null;
let commitPromise: Promise<void> | null = null;
let repositoryFetchGeneration = 0;
let statusVerificationController: AbortController | null = null;

const isAppearancePreference = (value: string | null): value is AppearancePreference =>
  value === 'system' || value === 'light' || value === 'dark';

const isAccentColor = (value: string | null): value is AccentColor =>
  value === 'blue' || value === 'purple' || value === 'cyan' || value === 'red' || value === 'rose';

export const useRepoStore = create<RepoState>((set, get) => ({
  repo: null,
  repoSha: null,
  isLoading: false,
  error: null,
  hasGitHubCredential: false,
  githubLogin: null,
  isDeveloperMode: false,
  isAuthenticating: false,
  authError: null,
  credentialProtection: null,
  isInitialized: false,
  iconsList: [],
  runtimeAppStatuses: {},
  pendingIconSelection: null,
  isSearchOpen: false,
  searchQuery: '',
  appearancePreference: 'system',
  accentColor: 'blue',

  setIsSearchOpen: (open: boolean) => set({ isSearchOpen: open }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),

  setAppearancePreference: async (preference) => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
    set({ appearancePreference: preference });
    try {
      await AsyncStorage.setItem(APPEARANCE_PREFERENCE_KEY, preference);
    } catch (e) {
      console.error('Failed to save appearance preference', e);
    }
  },

  setAccentColor: async (accentColor) => {
    set({ accentColor });
    try {
      await AsyncStorage.setItem(ACCENT_COLOR_KEY, accentColor);
    } catch (e) {
      console.error('Failed to save accent color', e);
    }
  },

  initializeStore: async () => {
    if (get().isInitialized) return;
    if (initializationPromise) return initializationPromise;

    initializationPromise = (async () => {
      let legacyToken: string | null = null;
      let savedAppearance: string | null = null;
      let savedAccentColor: string | null = null;

      try {
        const savedValues = await AsyncStorage.multiGet([
          LEGACY_TOKEN_KEY,
          APPEARANCE_PREFERENCE_KEY,
          ACCENT_COLOR_KEY,
        ]);
        legacyToken = savedValues[0][1];
        savedAppearance = savedValues[1][1];
        savedAccentColor = savedValues[2][1];
      } catch (error) {
        console.error('Failed to load saved preferences', error);
      }

      const appearancePreference = isAppearancePreference(savedAppearance) ? savedAppearance : 'system';
      const accentColor = isAccentColor(savedAccentColor) ? savedAccentColor : 'blue';
      Appearance.setColorScheme(appearancePreference === 'system' ? 'unspecified' : appearancePreference);
      set({ appearancePreference, accentColor });

      try {
        set({ credentialProtection: await getCredentialProtectionStatus() });
      } catch (error) {
        console.error('Failed to inspect credential protection', error);
      }

      // Public builds deliberately never restore or validate a local GitHub
      // token. Its different application identifier isolates the Keychain
      // item; this state-level guard protects upgrades and direct routes too.
      if (!isAdminBuild) {
        try {
          await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
        } catch (error) {
          console.error('Failed to remove a legacy public-build credential', error);
        }
        set({
          hasGitHubCredential: false,
          githubLogin: null,
          isDeveloperMode: false,
          isInitialized: true,
          isAuthenticating: false,
          authError: null,
        });
        return;
      }

      let storedToken: string | null = null;
      try {
        storedToken = await getStoredGitHubToken();
      } catch (error) {
        set({ authError: 'Developer Mode is locked. Authenticate again to unlock it.' });
        console.error('Failed to unlock the stored GitHub token', error);
      }

      if (legacyToken) {
        if (!storedToken) {
          try {
            await storeGitHubToken(legacyToken);
            storedToken = legacyToken;
          } catch (error) {
            console.error('Failed to migrate the legacy GitHub token to secure storage', error);
          }
        }

        // A PAT must never remain in AsyncStorage, even if secure migration fails.
        try {
          await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
        } catch (error) {
          console.error('Failed to remove the legacy GitHub token', error);
        }
      }

      if (!storedToken) {
        set({ hasGitHubCredential: false, isInitialized: true, isAuthenticating: false });
        return;
      }

      // Keep the token in the Keychain only. Zustand state is observable by the
      // JS runtime and must not retain a plaintext credential.
      set({ hasGitHubCredential: true, isAuthenticating: true, authError: null });
      try {
        const account = await validateGitHubToken(storedToken);
        set({
          githubLogin: account.login,
          isDeveloperMode: true,
          authError: null,
        });
      } catch (error) {
        const isRevokedToken = error instanceof GitHubApiError && error.code === 'AUTHENTICATION_FAILED';
        if (isRevokedToken) {
          try {
            await deleteStoredGitHubToken();
          } catch (deleteError) {
            console.error('Failed to remove an invalid GitHub token', deleteError);
          }
        }

        set({
          hasGitHubCredential: !isRevokedToken,
          githubLogin: null,
          isDeveloperMode: false,
          authError: githubErrorMessage(error),
        });
      } finally {
        set({ isInitialized: true, isAuthenticating: false });
      }
    })();

    try {
      await initializationPromise;
    } finally {
      initializationPromise = null;
    }
  },

  setGithubToken: async (token: string) => {
    const normalizedToken = token.trim();
    set({ isAuthenticating: true, authError: null });

    try {
      if (!isAdminBuild) {
        await deleteStoredGitHubToken();
        await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
        const error = new Error('This is the read-only ryP0 public build. Use ryP0 Admin for Developer Mode.');
        set({
          hasGitHubCredential: false,
          githubLogin: null,
          isDeveloperMode: false,
          authError: error.message,
        });
        throw error;
      }

      if (!normalizedToken) {
        await deleteStoredGitHubToken();
        await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
        set({
          hasGitHubCredential: false,
          githubLogin: null,
          isDeveloperMode: false,
          authError: null,
        });
        return null;
      }

      const account = await validateGitHubToken(normalizedToken);
      await storeGitHubToken(normalizedToken);
      await AsyncStorage.removeItem(LEGACY_TOKEN_KEY);
      set({
        hasGitHubCredential: true,
        githubLogin: account.login,
        isDeveloperMode: true,
        authError: null,
        credentialProtection: await getCredentialProtectionStatus(),
      });
      return account;
    } catch (error) {
      set({ authError: githubErrorMessage(error) });
      throw error;
    } finally {
      set({ isAuthenticating: false });
    }
  },

  installApp: async (app: RepoApp) => {
    const downloadURL = app.versions?.[0]?.downloadURL;
    if (!downloadURL) {
      throw new Error("No download URL available for this application.");
    }
    const safeDownloadURL = requireSafeExternalHttpsUrl(downloadURL, 'The IPA download link');

    // Open the download or installation link directly
    const { Linking } = require('react-native');
    const supported = await Linking.canOpenURL(safeDownloadURL);
    if (supported) {
      await Linking.openURL(safeDownloadURL);
    } else {
      await Linking.openURL(safeDownloadURL);
    }
  },

  setPendingIconSelection: (url: string | null) => {
    set({ pendingIconSelection: url });
  },

  fetchRepo: async () => {
    const generation = ++repositoryFetchGeneration;
    statusVerificationController?.abort();
    statusVerificationController = null;
    set({ isLoading: true, error: null });
    try {
      const snapshot = await fetchRepositorySnapshot();
      if (generation !== repositoryFetchGeneration) return;

      // Publish repo.json first so the list can render without waiting for every
      // remote IPA host and workflow endpoint.
      set({
        repo: snapshot.data,
        repoSha: snapshot.sha,
        runtimeAppStatuses: {},
        isLoading: false,
      });

      const controller = new AbortController();
      statusVerificationController = controller;
      setTimeout(() => {
        if (generation !== repositoryFetchGeneration || controller.signal.aborted) return;

        void verifyRepositoryAppStatuses(snapshot.data.apps, {
          concurrency: 4,
          signal: controller.signal,
          onStatus: ({ key, app, status }) => {
            if (generation !== repositoryFetchGeneration || controller.signal.aborted) return;
            const currentApp = get().repo?.apps.find(
              (candidate) => candidate.bundleIdentifier === app.bundleIdentifier,
            );
            if (!currentApp || getAppStatusKey(currentApp) !== key) return;

            set((state) => ({
              runtimeAppStatuses: {
                ...state.runtimeAppStatuses,
                [key]: status,
              },
            }));
          },
        }).catch((error) => {
          if (!controller.signal.aborted) {
            console.warn('App status verification did not complete.', error);
          }
        });
      }, 0);
    } catch (error) {
      if (generation !== repositoryFetchGeneration) return;
      set({ error: githubErrorMessage(error), isLoading: false });
    }
  },

  fetchIcons: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await fetchRepositoryIcons();
      const icons: GithubFile[] = data
        .filter(file => file.name.match(/\.(png|jpg|jpeg|gif|webp)$/i) && Boolean(file.download_url))
        .map(file => ({
          name: file.name,
          displayName: file.displayName,
          path: file.path,
          sha: file.sha,
          size: file.size,
          url: file.url,
          html_url: file.html_url,
          git_url: file.git_url,
          download_url: file.download_url!,
          type: file.type,
        }));
      set({ iconsList: icons, isLoading: false });
    } catch (error) {
      set({ error: githubErrorMessage(error), isLoading: false });
    }
  },

  uploadIcon: async (base64Data: string, filename: string) => {
    const { isDeveloperMode } = get();
    if (!isAdminBuild) throw new Error('This is the read-only ryP0 public build.');
    if (!isDeveloperMode) throw new Error('Validated Developer Mode access is required.');

    set({ isLoading: true, error: null });
    try {
      const token = await getStoredGitHubToken();
      if (!token) throw new Error('Developer credentials are unavailable. Sign in again in Settings.');
      const newUrl = await uploadRepositoryIcon(token, base64Data, filename);
      await get().fetchIcons();
      return newUrl;
    } catch (error) {
      set({ error: githubErrorMessage(error), isLoading: false });
      throw error;
    }
  },

  renameIcon: async (filename: string, displayName: string) => {
    const { isDeveloperMode } = get();
    if (!isAdminBuild) throw new Error('This is the read-only ryP0 public build.');
    if (!isDeveloperMode) throw new Error('Validated Developer Mode access is required.');

    const token = await getStoredGitHubToken();
    if (!token) throw new Error('Developer credentials are unavailable. Sign in again in Settings.');
    await renameRepositoryIcon(token, filename, displayName);

    const normalizedName = displayName.trim();
    set((state) => ({
      iconsList: state.iconsList.map((icon) => (
        icon.name === filename ? { ...icon, displayName: normalizedName } : icon
      )),
    }));
  },

  reorderApps: (newApps: RepoApp[]) => {
    const { repo } = get();
    if (repo) {
      set({ repo: { ...repo, apps: newApps } });
    }
  },

  updateApp: (index: number, updatedApp: RepoApp) => {
    const { repo } = get();
    if (repo) {
      const newApps = [...repo.apps];
      newApps[index] = updatedApp;
      set({ repo: { ...repo, apps: newApps } });
    }
  },

  deleteApp: (bundleIdentifier: string) => {
    const { repo } = get();
    if (repo) {
      set({ repo: { ...repo, apps: repo.apps.filter(a => a.bundleIdentifier !== bundleIdentifier) } });
    }
  },

  duplicateApp: (bundleIdentifier: string, newApp: RepoApp) => {
    const { repo } = get();
    if (repo) {
      const index = repo.apps.findIndex(a => a.bundleIdentifier === bundleIdentifier);
      if (index >= 0) {
        const newApps = [...repo.apps];
        newApps.splice(index + 1, 0, newApp);
        set({ repo: { ...repo, apps: newApps } });
      }
    }
  },

  commitChanges: async () => {
    if (commitPromise) return commitPromise;

    commitPromise = (async () => {
      const { repo, repoSha, isDeveloperMode } = get();
      if (!repo) throw new Error('No repository data to commit.');
      if (!repoSha) throw new Error('Refresh the repository before committing changes.');
      if (!isAdminBuild) throw new Error('This is the read-only ryP0 public build.');
      if (!isDeveloperMode) throw new Error('Validated Developer Mode access is required.');

      set({ isLoading: true, error: null });
      try {
        // Reading the protected keychain item gates every write with Face ID when available.
        const token = await getStoredGitHubToken();
        if (!token) throw new Error('Developer credentials are unavailable. Sign in again in Settings.');
        const result = await updateRepositoryFile(token, repo, repoSha);
        set({ repoSha: result.contentSha, isLoading: false });
      } catch (error) {
        set({ error: githubErrorMessage(error), isLoading: false });
        throw error;
      }
    })();

    try {
      await commitPromise;
    } finally {
      commitPromise = null;
    }
  }
}));
