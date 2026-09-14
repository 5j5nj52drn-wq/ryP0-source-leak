import { fetch } from 'expo/fetch';
import { RepoData } from '../types/repo';
import { getSafeExternalHttpsUrl, getSafeGitHubRepositoryUrl, isSafeExternalHttpsUrl } from './safe-url';

/** Public catalog data. This repository intentionally contains no source or secrets. */
export const CONTENT_REPOSITORY = {
  owner: 'Sami-Wali',
  name: 'ryP0-repository',
  branch: 'main',
  repoPath: 'repo.json',
  iconsPath: 'icons',
} as const;

/** Public IPA assets and repo.json. This repository contains no source archives. */
export const RELEASES_REPOSITORY = {
  owner: 'Sami-Wali',
  name: 'ryP0-repository',
  branch: 'main',
} as const;

/** Private Expo source and short-lived IPA staging assets. */
export const SOURCE_REPOSITORY = {
  owner: 'Sami-Wali',
  name: 'ryP0-source',
  branch: 'main',
} as const;

/** Private workflows and server-side automation only. Never expose its token. */
export const AUTOMATION_REPOSITORY = {
  owner: 'Sami-Wali',
  name: 'ryP0-automation',
  branch: 'main',
} as const;

export const PUBLIC_REPOSITORY_MANIFEST_URL = 'https://raw.githubusercontent.com/Sami-Wali/ryP0-repository/main/repo.json';
export const PUBLIC_ICON_BASE_URL = 'https://raw.githubusercontent.com/Sami-Wali/ryP0-repository/main/icons';

// Content-oriented code imported this name before the repository split. Keep a
// single alias so those calls cannot accidentally point at source or releases.
export const GITHUB_REPOSITORY = CONTENT_REPOSITORY;

// This CMS is intentionally single-admin. Repository write access is necessary
// but not sufficient: only the project owner's verified GitHub identity may
// unlock developer controls on a device.
export const ADMIN_GITHUB_LOGIN = 'Sami-Wali';

/**
 * GitHub usernames are case-insensitive. Keep the identity decision in the
 * data layer (rather than a settings-screen comparison) so every Developer
 * Mode unlock follows the same single-admin rule.
 */
export function isAdminGitHubLogin(login: string | null | undefined): boolean {
  return typeof login === 'string' && login.trim().toLowerCase() === ADMIN_GITHUB_LOGIN.toLowerCase();
}

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const REQUEST_TIMEOUT_MS = 15_000;

type GitHubErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'INSUFFICIENT_PERMISSION'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'REQUEST_FAILED';

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: GitHubErrorCode,
  ) {
    super(message);
    this.name = 'GitHubApiError';
  }
}

export interface ValidatedGitHubAccount {
  id: number;
  login: string;
  avatarUrl?: string;
}

interface GitHubUserResponse {
  id: number;
  login: string;
  avatar_url?: string;
}

interface GitHubRepositoryResponse {
  full_name: string;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
  };
}

interface GitHubContentResponse {
  name: string;
  displayName?: string;
  type: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  encoding?: string;
  content?: string;
  download_url?: string | null;
}

interface GitHubUpdateResponse {
  content?: {
    sha?: string;
  } | null;
  commit?: {
    sha?: string;
  };
}

export interface RepositorySnapshot {
  data: RepoData;
  sha: string;
}

export interface RepositoryUpdateResult {
  contentSha: string;
  commitSha?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertValidRepositoryData(value: unknown): asserts value is RepoData {
  if (!isRecord(value) || !isNonEmptyString(value.name) || !isNonEmptyString(value.identifier)) {
    throw new GitHubApiError('repo.json is missing its required name or identifier.', 0, 'INVALID_RESPONSE');
  }

  if (!Array.isArray(value.apps)) {
    throw new GitHubApiError('repo.json must contain an apps array.', 0, 'INVALID_RESPONSE');
  }

  if (value.sourceURL !== undefined && !isSafeExternalHttpsUrl(value.sourceURL)) {
    throw new GitHubApiError('repo.json has an unsafe repository source URL.', 0, 'INVALID_RESPONSE');
  }
  if (value.iconURL !== undefined && !isSafeExternalHttpsUrl(value.iconURL)) {
    throw new GitHubApiError('repo.json has an unsafe repository icon URL.', 0, 'INVALID_RESPONSE');
  }

  if (value.news !== undefined) {
    if (!Array.isArray(value.news)) {
      throw new GitHubApiError('repo.json has an invalid news array.', 0, 'INVALID_RESPONSE');
    }
    for (const [newsIndex, news] of value.news.entries()) {
      if (!isRecord(news)) {
        throw new GitHubApiError(`repo.json contains invalid news at position ${newsIndex + 1}.`, 0, 'INVALID_RESPONSE');
      }
      if (news.url !== undefined && !isSafeExternalHttpsUrl(news.url)) {
        throw new GitHubApiError(`repo.json contains an unsafe news link at position ${newsIndex + 1}.`, 0, 'INVALID_RESPONSE');
      }
      if (news.imageURL !== undefined && !isSafeExternalHttpsUrl(news.imageURL)) {
        throw new GitHubApiError(`repo.json contains an unsafe news image URL at position ${newsIndex + 1}.`, 0, 'INVALID_RESPONSE');
      }
    }
  }

  for (const [appIndex, app] of value.apps.entries()) {
    if (
      !isRecord(app) ||
      !isNonEmptyString(app.name) ||
      !isNonEmptyString(app.bundleIdentifier) ||
      !isNonEmptyString(app.developerName) ||
      !isNonEmptyString(app.iconURL) ||
      !isSafeExternalHttpsUrl(app.iconURL) ||
      !Array.isArray(app.versions)
    ) {
      throw new GitHubApiError(
        `repo.json contains an invalid app at position ${appIndex + 1}.`,
        0,
        'INVALID_RESPONSE',
      );
    }

    if (app.automation !== undefined) {
      if (!isRecord(app.automation)) {
        throw new GitHubApiError(
          `repo.json contains invalid automation metadata for ${app.name}.`,
          0,
          'INVALID_RESPONSE',
        );
      }
      if (app.automation.sourceURL !== undefined && !isSafeExternalHttpsUrl(app.automation.sourceURL)) {
        throw new GitHubApiError(
          `repo.json contains an unsafe automation source URL for ${app.name}.`,
          0,
          'INVALID_RESPONSE',
        );
      }
    }

    if (app.githubURL !== undefined && !getSafeGitHubRepositoryUrl(app.githubURL)) {
      throw new GitHubApiError(
        `repo.json contains an invalid GitHub project URL for ${app.name}.`,
        0,
        'INVALID_RESPONSE',
      );
    }

    if (app.importSource !== undefined) {
      if (!isRecord(app.importSource)) {
        throw new GitHubApiError(
          `repo.json contains invalid import metadata for ${app.name}.`,
          0,
          'INVALID_RESPONSE',
        );
      }
      if (app.importSource.sourceURL !== undefined && !isSafeExternalHttpsUrl(app.importSource.sourceURL)) {
        throw new GitHubApiError(
          `repo.json contains an unsafe import source URL for ${app.name}.`,
          0,
          'INVALID_RESPONSE',
        );
      }
    }

    for (const [versionIndex, version] of app.versions.entries()) {
      if (
        !isRecord(version) ||
        !isNonEmptyString(version.version) ||
        (version.buildVersion !== undefined && !isNonEmptyString(version.buildVersion)) ||
        !isNonEmptyString(version.date) ||
        !isNonEmptyString(version.downloadURL) ||
        !isSafeExternalHttpsUrl(version.downloadURL) ||
        typeof version.size !== 'number' ||
        !Number.isFinite(version.size) ||
        version.size < 0
      ) {
        throw new GitHubApiError(
          `repo.json contains an invalid version for ${app.name} at position ${versionIndex + 1}.`,
          0,
          'INVALID_RESPONSE',
        );
      }
    }
  }
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new TextDecoder().decode(bytes);
}

function errorMessageFromPayload(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.message === 'string' ? payload.message : null;
}

async function githubRequest<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', GITHUB_API_VERSION);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (init.body) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (response.ok) {
          throw new GitHubApiError('GitHub returned an unreadable response.', response.status, 'INVALID_RESPONSE');
        }
      }
    }

    if (!response.ok) {
      const apiMessage = errorMessageFromPayload(payload);

      if (response.status === 401) {
        throw new GitHubApiError('The GitHub token is invalid or has expired.', 401, 'AUTHENTICATION_FAILED');
      }

      if (response.status === 409) {
        throw new GitHubApiError(
          'The repository changed since it was loaded. Refresh before committing so newer changes are not overwritten.',
          409,
          'CONFLICT',
        );
      }

      if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
        throw new GitHubApiError('GitHub rate limit reached. Try again after it resets.', 403, 'RATE_LIMITED');
      }

      if (response.status === 403 || response.status === 404) {
        throw new GitHubApiError(
          apiMessage || 'The token does not have access to this repository.',
          response.status,
          'INSUFFICIENT_PERMISSION',
        );
      }

      throw new GitHubApiError(
        apiMessage || `GitHub request failed with status ${response.status}.`,
        response.status,
        'REQUEST_FAILED',
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw error;
    }

    const isAbort = error instanceof Error && error.name === 'AbortError';
    throw new GitHubApiError(
      isAbort ? 'GitHub took too long to respond. Check your connection and try again.' : 'Unable to reach GitHub. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function validateGitHubToken(token: string): Promise<ValidatedGitHubAccount> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new GitHubApiError('Enter a GitHub personal access token.', 0, 'AUTHENTICATION_FAILED');
  }

  // Verify the token's owner before requesting any repository permissions.
  // This avoids treating mere repository access as a Developer Mode signal.
  const user = await githubRequest<GitHubUserResponse>('/user', normalizedToken);

  if (!isNonEmptyString(user.login) || typeof user.id !== 'number') {
    throw new GitHubApiError('GitHub returned an invalid account response.', 0, 'INVALID_RESPONSE');
  }

  if (!isAdminGitHubLogin(user.login)) {
    throw new GitHubApiError(
      `Only @${ADMIN_GITHUB_LOGIN} can unlock ryP0 Developer Mode on this device.`,
      403,
      'INSUFFICIENT_PERMISSION',
    );
  }

  const developerRepositories = [CONTENT_REPOSITORY, RELEASES_REPOSITORY, SOURCE_REPOSITORY, AUTOMATION_REPOSITORY] as const;
  const repositories = await Promise.all(developerRepositories.map(async (target) => ({
    target,
    repository: await githubRequest<GitHubRepositoryResponse>(
      `/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.name)}`,
      normalizedToken,
    ),
  })));
  const unavailable = repositories
    .filter(({ repository }) => !repository.permissions?.push && !repository.permissions?.maintain && !repository.permissions?.admin)
    .map(({ target }) => `${target.owner}/${target.name}`);

  if (unavailable.length) {
    throw new GitHubApiError(
      `@${user.login} needs write access to ${unavailable.join(', ')} before Developer Mode can be enabled.`,
      403,
      'INSUFFICIENT_PERMISSION',
    );
  }

  return {
    id: user.id,
    login: user.login,
    avatarUrl: user.avatar_url,
  };
}

export async function fetchRepositorySnapshot(token?: string): Promise<RepositorySnapshot> {
  const path = `/repos/${encodeURIComponent(GITHUB_REPOSITORY.owner)}/${encodeURIComponent(GITHUB_REPOSITORY.name)}/contents/${encodePath(GITHUB_REPOSITORY.repoPath)}?ref=${encodeURIComponent(GITHUB_REPOSITORY.branch)}`;
  const file = await githubRequest<GitHubContentResponse>(path, token);

  if (file.type !== 'file' || !isNonEmptyString(file.sha) || file.encoding !== 'base64' || !isNonEmptyString(file.content)) {
    throw new GitHubApiError('GitHub did not return repo.json as a readable file.', 0, 'INVALID_RESPONSE');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(base64ToUtf8(file.content));
  } catch {
    throw new GitHubApiError('repo.json contains invalid JSON.', 0, 'INVALID_RESPONSE');
  }

  assertValidRepositoryData(parsed);
  return { data: parsed, sha: file.sha };
}

export async function updateRepositoryFile(
  token: string,
  data: RepoData,
  expectedSha: string,
): Promise<RepositoryUpdateResult> {
  if (!isNonEmptyString(expectedSha)) {
    throw new GitHubApiError('Refresh the repository before committing changes.', 0, 'CONFLICT');
  }

  assertValidRepositoryData(data);
  const path = `/repos/${encodeURIComponent(GITHUB_REPOSITORY.owner)}/${encodeURIComponent(GITHUB_REPOSITORY.name)}/contents/${encodePath(GITHUB_REPOSITORY.repoPath)}`;
  const response = await githubRequest<GitHubUpdateResponse>(path, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: 'Update repo.json via ryP0 CMS',
      content: utf8ToBase64(`${JSON.stringify(data, null, 2)}\n`),
      sha: expectedSha,
      branch: GITHUB_REPOSITORY.branch,
    }),
  });
  const contentSha = response.content?.sha;

  if (!isNonEmptyString(contentSha)) {
    throw new GitHubApiError('GitHub accepted the update but did not return the new file SHA.', 0, 'INVALID_RESPONSE');
  }

  return {
    contentSha,
    commitSha: response.commit?.sha,
  };
}

export async function fetchRepositoryIcons(token?: string): Promise<GitHubContentResponse[]> {
  const path = `/repos/${encodeURIComponent(GITHUB_REPOSITORY.owner)}/${encodeURIComponent(GITHUB_REPOSITORY.name)}/contents/${encodePath(GITHUB_REPOSITORY.iconsPath)}?ref=${encodeURIComponent(GITHUB_REPOSITORY.branch)}`;
  const payload = await githubRequest<unknown>(path, token);

  if (!Array.isArray(payload)) {
    throw new GitHubApiError('GitHub returned an invalid icons directory response.', 0, 'INVALID_RESPONSE');
  }

  const labels = await fetchIconLabels(token);
  return payload.filter((item): item is GitHubContentResponse => (
    isRecord(item) &&
    item.type === 'file' &&
    isNonEmptyString(item.name) &&
    isNonEmptyString(item.path) &&
    isNonEmptyString(item.sha) &&
    typeof item.size === 'number' &&
    isNonEmptyString(item.url) &&
    isNonEmptyString(item.html_url) &&
    isNonEmptyString(item.git_url)
  )).map((item) => ({
    ...item,
    // GitHub normally supplies this URL, but only retain it if it is safe to
    // hand to the image layer or a future external-link action.
    download_url: getSafeExternalHttpsUrl(item.download_url) ?? null,
    displayName: labels.names[item.name],
  }));
}

interface IconLabelsSnapshot {
  names: Record<string, string>;
  sha?: string;
}

async function fetchIconLabels(token?: string): Promise<IconLabelsSnapshot> {
  const labelsPath = `${GITHUB_REPOSITORY.iconsPath}/labels.json`;
  const path = `/repos/${encodeURIComponent(GITHUB_REPOSITORY.owner)}/${encodeURIComponent(GITHUB_REPOSITORY.name)}/contents/${encodePath(labelsPath)}?ref=${encodeURIComponent(GITHUB_REPOSITORY.branch)}`;
  let file: GitHubContentResponse;
  try {
    file = await githubRequest<GitHubContentResponse>(path, token);
  } catch (error) {
    if (error instanceof GitHubApiError && error.status === 404) return { names: {} };
    throw error;
  }
  if (file.encoding !== 'base64' || !file.content || !file.sha) {
    throw new GitHubApiError('The icon names file could not be read.', 0, 'INVALID_RESPONSE');
  }
  let value: unknown;
  try { value = JSON.parse(base64ToUtf8(file.content)); } catch {
    throw new GitHubApiError('The icon names file contains invalid JSON.', 0, 'INVALID_RESPONSE');
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.names)) {
    throw new GitHubApiError('The icon names file has an unsupported format.', 0, 'INVALID_RESPONSE');
  }
  const names: Record<string, string> = Object.create(null);
  for (const [filename, name] of Object.entries(value.names)) {
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    if (normalizedName && normalizedName.length <= 100) names[filename] = normalizedName;
  }
  return { names, sha: file.sha };
}

/** Rename the gallery label while preserving every already published icon URL. */
export async function renameRepositoryIcon(token: string, filename: string, displayName: string): Promise<void> {
  const normalizedName = displayName.trim();
  if (!normalizedName || normalizedName.length > 100 || /[\u0000-\u001f\u007f]/.test(normalizedName)) {
    throw new GitHubApiError('Enter an icon name between 1 and 100 characters.', 0, 'REQUEST_FAILED');
  }
  if (!filename || filename.includes('/') || filename.includes('\\') || !/\.(png|jpe?g|gif|webp)$/i.test(filename)) {
    throw new GitHubApiError('Select an image from the repository gallery.', 0, 'REQUEST_FAILED');
  }
  await validateGitHubToken(token);
  const iconPath = `${GITHUB_REPOSITORY.iconsPath}/${filename}`;
  const repositoryPath = `/repos/${encodeURIComponent(GITHUB_REPOSITORY.owner)}/${encodeURIComponent(GITHUB_REPOSITORY.name)}`;
  const icon = await githubRequest<GitHubContentResponse>(`${repositoryPath}/contents/${encodePath(iconPath)}?ref=${encodeURIComponent(GITHUB_REPOSITORY.branch)}`, token);
  if (icon.type !== 'file') throw new GitHubApiError('The selected icon no longer exists.', 404, 'CONFLICT');
  const labels = await fetchIconLabels(token);
  const names = { ...labels.names, [filename]: normalizedName };
  const labelsPath = `${GITHUB_REPOSITORY.iconsPath}/labels.json`;
  const response = await githubRequest<GitHubUpdateResponse>(`${repositoryPath}/contents/${encodePath(labelsPath)}`, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Rename gallery icon: ${filename}`,
      content: utf8ToBase64(`${JSON.stringify({ version: 1, names }, null, 2)}\n`),
      ...(labels.sha ? { sha: labels.sha } : {}),
      branch: GITHUB_REPOSITORY.branch,
    }),
  });
  if (!isNonEmptyString(response.content?.sha)) {
    throw new GitHubApiError('GitHub accepted the icon name but did not confirm the labels file.', 0, 'INVALID_RESPONSE');
  }
}

export async function uploadRepositoryIcon(
  token: string,
  base64Data: string,
  filename: string,
): Promise<string> {
  const safeFilename = filename.trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!safeFilename || safeFilename === '.' || safeFilename === '..') {
    throw new GitHubApiError('Choose a valid icon filename.', 0, 'REQUEST_FAILED');
  }

  const relativePath = `${GITHUB_REPOSITORY.iconsPath}/${safeFilename}`;
  const path = `/repos/${encodeURIComponent(GITHUB_REPOSITORY.owner)}/${encodeURIComponent(GITHUB_REPOSITORY.name)}/contents/${encodePath(relativePath)}`;
  const response = await githubRequest<GitHubUpdateResponse & { content?: GitHubContentResponse | null }>(path, token, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Upload icon: ${safeFilename}`,
      content: base64Data.replace(/^data:[^;]+;base64,/, ''),
      branch: GITHUB_REPOSITORY.branch,
    }),
  });

  const downloadUrl = getSafeExternalHttpsUrl(response.content?.download_url);
  if (!downloadUrl) {
    throw new GitHubApiError('GitHub accepted the icon but did not return its URL.', 0, 'INVALID_RESPONSE');
  }

  return downloadUrl;
}

export function githubErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected GitHub error occurred.';
}
