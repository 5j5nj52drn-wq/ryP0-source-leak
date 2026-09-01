import { create } from 'zustand';
import { RepoData, RepoApp } from '../types/repo';

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface GithubFile {
  name: string;
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
  isLoading: boolean;
  error: string | null;
  githubToken: string | null;
  isDeveloperMode: boolean;
  iconsList: GithubFile[];
  pendingIconSelection: string | null;
  isSearchOpen: boolean;

  // Actions
  initializeStore: () => Promise<void>;
  setGithubToken: (token: string) => Promise<void>;
  setIsSearchOpen: (open: boolean) => void;
  fetchRepo: () => Promise<void>;
  reorderApps: (apps: RepoApp[]) => void;
  updateApp: (index: number, app: RepoApp) => void;
  deleteApp: (bundleIdentifier: string) => void;
  duplicateApp: (bundleIdentifier: string, newApp: RepoApp) => void;
  commitChanges: () => Promise<void>;
  fetchIcons: () => Promise<void>;
  uploadIcon: (base64Data: string, filename: string) => Promise<string>;
  setPendingIconSelection: (url: string | null) => void;
  installApp: (app: RepoApp) => Promise<void>;
}

const REPO_OWNER = 'ry0-x';
const REPO_NAME = 'ry0-x.github.io';
const FILE_PATH = 'repo.json';
const BRANCH = 'main';
const TOKEN_KEY = '@github_pat';

export const useRepoStore = create<RepoState>((set, get) => ({
  repo: null,
  isLoading: false,
  error: null,
  githubToken: null,
  isDeveloperMode: false,
  iconsList: [],
  pendingIconSelection: null,
  isSearchOpen: false,
  searchQuery: '',

  setIsSearchOpen: (open: boolean) => set({ isSearchOpen: open }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),

  initializeStore: async () => {
    try {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        set({ githubToken: token, isDeveloperMode: true });
      }
    } catch (e) {
      console.error("Failed to load token", e);
    }
  },

  setGithubToken: async (token: string) => {
    try {
      if (token) {
        await AsyncStorage.setItem(TOKEN_KEY, token);
        set({ githubToken: token, isDeveloperMode: true });
      } else {
        await AsyncStorage.removeItem(TOKEN_KEY);
        set({ githubToken: null, isDeveloperMode: false });
      }
    } catch (e) {
      console.error("Failed to save token", e);
    }
  },

  installApp: async (app: RepoApp) => {
    const downloadURL = app.versions?.[0]?.downloadURL;
    if (!downloadURL) {
      throw new Error("No download URL available for this application.");
    }

    // Open the download or installation link directly
    const { Linking } = require('react-native');
    const supported = await Linking.canOpenURL(downloadURL);
    if (supported) {
      await Linking.openURL(downloadURL);
    } else {
      await Linking.openURL(downloadURL);
    }
  },

  setPendingIconSelection: (url: string | null) => {
    set({ pendingIconSelection: url });
  },

  fetchRepo: async () => {
    set({ isLoading: true, error: null });
    try {
      // Fetch directly from raw github user content (bypasses API rate limits for reading)
      const response = await fetch(`https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${FILE_PATH}`);
      if (!response.ok) throw new Error('Failed to fetch repo.json');

      const data: RepoData = await response.json();
      set({ repo: data, isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchIcons: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/icons?ref=${BRANCH}`);
      if (!response.ok) throw new Error('Failed to fetch icons directory');

      const data = await response.json();
      if (Array.isArray(data)) {
        // Filter out non-images just in case
        const icons = data.filter(file => file.type === 'file' && file.name.match(/\.(png|jpg|jpeg|gif)$/i));
        set({ iconsList: icons, isLoading: false });
      } else {
        set({ iconsList: [], isLoading: false });
      }
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  uploadIcon: async (base64Data: string, filename: string) => {
    const { githubToken } = get();
    if (!githubToken) throw new Error("Not authenticated");

    set({ isLoading: true, error: null });
    try {
      const response = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/icons/${filename}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Upload icon: ${filename}`,
          content: base64Data,
          branch: BRANCH
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to upload: ${errorData.message}`);
      }

      const data = await response.json();
      const newUrl = data.content.download_url;

      // Refresh the icon list
      await get().fetchIcons();

      return newUrl;
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
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
    const { repo, githubToken } = get();
    if (!repo) throw new Error("No repo data to commit");
    if (!githubToken) throw new Error("Not authenticated");

    set({ isLoading: true, error: null });
    try {
      // 1. Get the current file SHA (required for updates via API)
      const shaResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}?ref=${BRANCH}`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      });

      if (!shaResponse.ok) throw new Error("Failed to get current file SHA");
      const shaData = await shaResponse.json();
      const sha = shaData.sha;

      // 2. Commit the new JSON
      const jsonString = JSON.stringify(repo, null, 2) + '\n';
      const content = btoa(unescape(encodeURIComponent(jsonString))); // safe base64 encode for UTF-8

      const updateResponse = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'Update repo.json via CMS',
          content,
          sha,
          branch: BRANCH
        })
      });

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json();
        throw new Error(`Failed to commit: ${errorData.message}`);
      }

      set({ isLoading: false });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  }
}));
