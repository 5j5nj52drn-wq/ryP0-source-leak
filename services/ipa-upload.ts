import * as Crypto from 'expo-crypto';
import type { File as ExpoFile, UploadProgress } from 'expo-file-system';
import { fetch } from 'expo/fetch';
import { SOURCE_REPOSITORY } from './github-api';
import { getStoredGitHubToken } from './secure-credentials';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_UPLOADS_URL = 'https://uploads.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const PRIVATE_IPA_STAGING_RELEASE_TAG = 'ryp0-ipa-staging';
const MAX_RELEASE_ASSET_BYTES = 2 * 1024 * 1024 * 1024;
const METADATA_TIMEOUT_MS = 30_000;

type GitHubRepositoryDetails = {
  private?: boolean;
};

type GitHubRelease = {
  id?: number;
  tag_name?: string;
  draft?: boolean;
  immutable?: boolean;
};

type GitHubReleaseAsset = {
  browser_download_url?: string;
  name?: string;
  size?: number;
  state?: string;
};

export type IpaUploadProgress = UploadProgress;

export type IpaUploadResult = {
  /** Private staging location; it is not a user-installable public URL. */
  uploadRepository: string;
  stagingReleaseTag: string;
  filename: string;
  originalFilename: string;
  size: number;
};

export class IpaUploadError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'IpaUploadError';
  }
}

type DocumentPickerModule = typeof import('expo-document-picker');
type ExpoFileSystemModule = typeof import('expo-file-system');

/**
 * The upload controls can be delivered by an OTA update before an older
 * development client has been rebuilt with these native modules. Do not import
 * either module at route-evaluation time: a missing module must leave Add App
 * usable and explain how to get the current build when the admin taps upload.
 */
function loadDocumentPicker(): DocumentPickerModule {
  try {
    return require('expo-document-picker') as DocumentPickerModule;
  } catch {
    throw new IpaUploadError(
      'IPA upload needs the current ryP0 build. Reinstall the latest development or release build, then try again.',
    );
  }
}

function loadFileSystem(): ExpoFileSystemModule {
  try {
    return require('expo-file-system') as ExpoFileSystemModule;
  } catch {
    throw new IpaUploadError(
      'IPA upload needs the current ryP0 build. Reinstall the latest development or release build, then try again.',
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageFromPayload(value: unknown): string | undefined {
  return isRecord(value) && typeof value.message === 'string' ? value.message : undefined;
}

function releaseApiPath(path: string) {
  return `${GITHUB_API_URL}/repos/${encodeURIComponent(SOURCE_REPOSITORY.owner)}/${encodeURIComponent(SOURCE_REPOSITORY.name)}${path}`;
}

async function githubJson<T>(
  url: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-GitHub-Api-Version', GITHUB_API_VERSION);
  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (response.ok) throw new IpaUploadError('GitHub returned an unreadable response.', response.status);
      }
    }

    if (!response.ok) {
      const apiMessage = messageFromPayload(payload);
      if (response.status === 401) {
        throw new IpaUploadError('The saved GitHub token is invalid or expired. Sign in again in Settings.', 401);
      }
      if (response.status === 403 || response.status === 404) {
        throw new IpaUploadError(
          apiMessage || 'The saved GitHub token cannot create release assets in this repository.',
          response.status,
        );
      }
      if (response.status === 422) {
        throw new IpaUploadError(apiMessage || 'GitHub rejected the release asset metadata.', 422);
      }
      throw new IpaUploadError(apiMessage || `GitHub request failed (${response.status}).`, response.status);
    }

    return payload as T;
  } catch (error) {
    if (error instanceof IpaUploadError) throw error;
    const wasAborted = error instanceof Error && error.name === 'AbortError';
    throw new IpaUploadError(
      wasAborted
        ? 'GitHub took too long to prepare the upload. Try again on a stable connection.'
        : 'Unable to reach GitHub. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

function assertRelease(value: GitHubRelease): GitHubRelease & { id: number } {
  if (!Number.isInteger(value.id) || (value.id || 0) <= 0) {
    throw new IpaUploadError('GitHub did not return a usable release for IPA uploads.');
  }
  if (value.immutable) {
    throw new IpaUploadError('The IPA upload release is immutable. Unlock or recreate it on GitHub before uploading.');
  }
  return value as GitHubRelease & { id: number };
}

async function getUploadRelease(token: string): Promise<(GitHubRelease & { id: number }) | null> {
  try {
    const release = await githubJson<GitHubRelease>(
      releaseApiPath(`/releases/tags/${encodeURIComponent(PRIVATE_IPA_STAGING_RELEASE_TAG)}`),
      token,
    );
    return assertRelease(release);
  } catch (error) {
    if (error instanceof IpaUploadError && error.status === 404) return null;
    throw error;
  }
}

async function ensurePrivateUploadRelease(token: string): Promise<GitHubRelease & { id: number }> {
  const repository = await githubJson<GitHubRepositoryDetails>(releaseApiPath(''), token);
  if (repository.private !== true) {
    throw new IpaUploadError('IPA staging must use the private ryP0-source repository.');
  }

  let release = await getUploadRelease(token);
  if (!release) {
    try {
      release = assertRelease(await githubJson<GitHubRelease>(releaseApiPath('/releases'), token, {
        method: 'POST',
        body: JSON.stringify({
          tag_name: PRIVATE_IPA_STAGING_RELEASE_TAG,
          target_commitish: SOURCE_REPOSITORY.branch,
          name: 'ryP0 IPA validation staging',
          body: 'Temporary private IPA assets uploaded by the authenticated ryP0 admin app. The private importer validates and republishes only approved IPA files.',
          // The repository itself is private. Keeping this prerelease visible
          // to its read-only GitHub App token avoids a draft-release access
          // mismatch while still keeping the raw IPA inaccessible to users.
          draft: false,
          prerelease: true,
        }),
      }));
    } catch (error) {
      // Another authenticated client can create the dedicated release between
      // our lookup and create request. Resolve that race by reading it once.
      if (!(error instanceof IpaUploadError) || error.status !== 422) throw error;
      release = await getUploadRelease(token);
      if (!release) throw error;
    }
  }

  return release;
}

function validatedOriginalFilename(value: string) {
  const filename = value.trim().split(/[\\/]/).pop() || '';
  if (!filename.toLowerCase().endsWith('.ipa')) {
    throw new IpaUploadError('Choose a file whose name ends in .ipa.');
  }
  return filename;
}

function uniqueAssetFilename(originalFilename: string) {
  const originalStem = originalFilename.replace(/\.ipa$/i, '').normalize('NFKD');
  const safeStem = originalStem
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100) || 'app';
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  const suffix = Crypto.randomUUID().slice(0, 8);
  return `${safeStem}-${timestamp}-${suffix}.ipa`;
}

function validateLocalFile(file: ExpoFile, reportedSize?: number) {
  if (!file.exists) {
    throw new IpaUploadError('The selected IPA is no longer available. Choose it again.');
  }
  const size = file.size || reportedSize || 0;
  if (size <= 0) {
    throw new IpaUploadError('The selected IPA is empty.');
  }
  if (size >= MAX_RELEASE_ASSET_BYTES) {
    throw new IpaUploadError('GitHub release assets must be smaller than 2 GiB.');
  }
  return size;
}

async function uploadLocalIpa(
  file: ExpoFile,
  originalFilename: string,
  token: string,
  options: { signal?: AbortSignal; onProgress?: (progress: IpaUploadProgress) => void },
): Promise<IpaUploadResult> {
  const size = validateLocalFile(file);
  const release = await ensurePrivateUploadRelease(token);
  const { UploadType } = loadFileSystem();
  const filename = uniqueAssetFilename(originalFilename);
  const query = new URLSearchParams({ name: filename, label: originalFilename });
  const uploadUrl = `${GITHUB_UPLOADS_URL}/repos/${encodeURIComponent(SOURCE_REPOSITORY.owner)}/${encodeURIComponent(SOURCE_REPOSITORY.name)}/releases/${release.id}/assets?${query}`;
  const uploadTask = file.createUploadTask(uploadUrl, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: 'application/octet-stream',
    sessionType: 'background',
    signal: options.signal,
    onProgress: options.onProgress,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    },
  });

  let response;
  try {
    response = await uploadTask.uploadAsync();
  } catch (error) {
    const cancelled = options.signal?.aborted || (error instanceof Error && error.name === 'AbortError');
    throw new IpaUploadError(
      cancelled ? 'IPA upload cancelled.' : 'The IPA could not be uploaded to GitHub. Check your connection and try again.',
    );
  } finally {
    uploadTask.release();
  }

  let payload: unknown = null;
  try {
    payload = response.body ? JSON.parse(response.body) : null;
  } catch {
    // The status-specific message below is more useful than a JSON parse error.
  }
  if (response.status < 200 || response.status >= 300) {
    throw new IpaUploadError(
      messageFromPayload(payload) || `GitHub rejected the IPA upload (${response.status}).`,
      response.status,
    );
  }

  const asset = payload as GitHubReleaseAsset | null;
  if (
    !asset ||
    asset.state !== 'uploaded' ||
    typeof asset.name !== 'string' ||
    !asset.name
  ) {
    throw new IpaUploadError('GitHub accepted the IPA but did not return private staging metadata.');
  }

  return {
    uploadRepository: `${SOURCE_REPOSITORY.owner}/${SOURCE_REPOSITORY.name}`,
    stagingReleaseTag: PRIVATE_IPA_STAGING_RELEASE_TAG,
    filename: asset.name,
    originalFilename,
    size: typeof asset.size === 'number' && asset.size > 0 ? asset.size : size,
  };
}

/**
 * Presents the system document picker, streams the selected IPA to a private
 * staging release, then removes only the temporary cache copy. A protected
 * workflow validates it before any public IPA asset or repo.json entry exists.
 */
export async function pickAndUploadIpa(options: {
  signal?: AbortSignal;
  onFileSelected?: (filename: string, size: number) => void;
  onProgress?: (progress: IpaUploadProgress) => void;
} = {}): Promise<IpaUploadResult | null> {
  const DocumentPicker = loadDocumentPicker();
  const { File } = loadFileSystem();
  const selection = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) return null;

  const asset = selection.assets[0];
  if (!asset) throw new IpaUploadError('The document picker did not return a file.');
  const originalFilename = validatedOriginalFilename(asset.name);
  const file = new File(asset.uri);
  const size = validateLocalFile(file, asset.size);
  options.onFileSelected?.(originalFilename, size);

  try {
    const token = await getStoredGitHubToken();
    if (!token?.trim()) {
      throw new IpaUploadError('Developer credentials are unavailable. Sign in again in Settings.');
    }
    return await uploadLocalIpa(file, originalFilename, token.trim(), options);
  } finally {
    // DocumentPicker created this private cache copy specifically for immediate
    // File access. Never touch the user's original document.
    try {
      if (file.exists) file.delete();
    } catch {
      // Cache cleanup is best effort and must not mask an upload result.
    }
  }
}
