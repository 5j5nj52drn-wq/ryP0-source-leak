import { fetch } from 'expo/fetch';
import type { AppUpdatePolicy, RepoApp, RepoAppStatus } from '../types/repo';
import { getSafeExternalHttpsUrl } from './safe-url';

// The repository workflow refreshes its persisted health snapshot every six
// hours, while a device performs its own check on launch. Keep a successful
// server result useful through ordinary offline use without presenting a stale
// week-old result as current.
export const STATUS_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const DEFAULT_VERIFICATION_CONCURRENCY = 4;
const MAX_VERIFICATION_CONCURRENCY = 8;
const VERIFICATION_CACHE_TTL_MS = 10 * 60 * 1000;
const DOWNLOAD_TIMEOUT_MS = 12_000;

interface DownloadCheck {
  state: 'available' | 'unavailable' | 'unknown';
  message?: string;
}

interface TimedCacheEntry<T> {
  value: T;
  cachedAt: number;
}

const appStatusCache = new Map<string, TimedCacheEntry<RepoAppStatus>>();

export interface AppStatusVerification {
  key: string;
  app: RepoApp;
  status: RepoAppStatus;
}

export interface VerifyRepositoryAppStatusesOptions {
  concurrency?: number;
  signal?: AbortSignal;
  onStatus?: (verification: AppStatusVerification) => void;
}

export function getAppUpdatePolicy(app: RepoApp): AppUpdatePolicy {
  if (app.updatePolicy === 'daily' || app.updatePolicy === 'static') return app.updatePolicy;
  // A source URL alone does not prove that this repository tracks its releases.
  return app.automation?.workflowPath ? 'daily' : 'static';
}

/**
 * Runtime checks are keyed by both identity and the current artifact. A completed
 * check can therefore never leak onto a newly edited download URL.
 */
export function getAppStatusKey(app: Pick<RepoApp, 'bundleIdentifier' | 'versions'>): string {
  return `${app.bundleIdentifier}\u0000${app.versions[0]?.downloadURL ?? ''}`;
}

export function getAppStatus(
  app: RepoApp,
  verifiedStatus: RepoAppStatus | undefined = app.status,
  now = Date.now(),
) {
  const checkedAt = verifiedStatus?.checkedAt ? Date.parse(verifiedStatus.checkedAt) : NaN;
  const latestDownloadURL = app.versions[0]?.downloadURL;
  const matchesDownload = Boolean(latestDownloadURL) && verifiedStatus?.checkedDownloadURL === latestDownloadURL;
  const isFresh = Number.isFinite(checkedAt) && checkedAt <= now + 60_000 && now - checkedAt <= STATUS_MAX_AGE_MS;
  const isCurrent = matchesDownload && isFresh;
  // repo.json is remotely editable. Treat an unrecognised persisted value as
  // unknown instead of passing an undefined SF Symbol/color into the native
  // badge tree and risking a broken card while the repository is repaired.
  const persistedState = verifiedStatus?.state;
  const isKnownState = persistedState === 'healthy'
    || persistedState === 'broken'
    || persistedState === 'update-error'
    || persistedState === 'unknown';
  const state: RepoAppStatus['state'] = isCurrent && isKnownState ? persistedState : 'unknown';
  const presentations = {
    healthy: {
      label: 'Healthy',
      detail: 'The latest IPA is available',
      color: '#248A3D',
      symbol: 'checkmark.circle.fill',
    },
    broken: {
      label: 'Broken',
      detail: 'The latest IPA download is unavailable',
      color: '#FF3B30',
      symbol: 'xmark.circle.fill',
    },
    'update-error': {
      label: 'Update Error',
      detail: 'The latest automatic update failed',
      color: '#FF9500',
      symbol: 'exclamationmark.triangle.fill',
    },
    unknown: {
      label: 'Unknown',
      detail: 'The latest IPA has not been verified recently',
      color: '#8E8E93',
      symbol: 'questionmark.circle',
    },
  } as const;

  return {
    ...presentations[state],
    state,
    checkedAt: isCurrent ? verifiedStatus?.checkedAt : undefined,
    message: isCurrent ? verifiedStatus?.message : undefined,
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function cachedValue<T>(cache: Map<string, TimedCacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt <= VERIFICATION_CACHE_TTL_MS) return entry.value;
  cache.delete(key);
  return undefined;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, timeoutMs);
  parentSignal?.addEventListener('abort', abort, { once: true });

  if (parentSignal?.aborted) controller.abort();

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    parentSignal?.removeEventListener('abort', abort);
  }
}

async function cancelResponseBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Headers are sufficient for an availability check. Some native response
    // streams are already closed by the time cancellation reaches them.
  }
}

async function checkDownload(downloadURL: string | undefined, signal?: AbortSignal): Promise<DownloadCheck> {
  if (!downloadURL) {
    return { state: 'unavailable', message: 'No latest IPA download URL is configured.' };
  }

  const safeDownloadURL = getSafeExternalHttpsUrl(downloadURL);
  if (!safeDownloadURL) {
    return { state: 'unavailable', message: 'The latest IPA download URL must use HTTPS.' };
  }

  try {
    // A one-byte ranged GET follows real download redirects and works with hosts
    // that reject HEAD. Cancel immediately after the response headers so a server
    // that ignores Range cannot stream the whole IPA into memory.
    const response = await fetchWithTimeout(
      safeDownloadURL,
      {
        method: 'GET',
        headers: { Accept: 'application/octet-stream', Range: 'bytes=0-0' },
        redirect: 'follow',
        credentials: 'omit',
      },
      DOWNLOAD_TIMEOUT_MS,
      signal,
    );
    const isAvailable = response.ok;
    const statusCode = response.status;
    await cancelResponseBody(response);

    return isAvailable
      ? { state: 'available' }
      : { state: 'unavailable', message: `The latest IPA returned HTTP ${statusCode}.` };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) throw error;
    return { state: 'unknown', message: 'The latest IPA could not be reached from this device.' };
  }
}

async function verifyAppStatus(
  app: RepoApp,
  options: Pick<VerifyRepositoryAppStatusesOptions, 'signal'>,
): Promise<RepoAppStatus> {
  const cacheKey = getAppStatusKey(app);
  const cached = cachedValue(appStatusCache, cacheKey);
  if (cached) return cached;

  const checkedDownloadURL = app.versions[0]?.downloadURL ?? '';
  const persistedPresentation = getAppStatus(app);
  const currentPersistedStatus = persistedPresentation.checkedAt ? app.status : undefined;
  const download = await checkDownload(checkedDownloadURL, options.signal);
  const checkedAt = new Date().toISOString();
  let result: RepoAppStatus;

  if (download.state === 'unavailable') {
    result = {
      state: 'broken',
      checkedDownloadURL,
      checkedAt,
      ...(download.message ? { message: download.message } : {}),
    };
  } else if (download.state === 'available' && currentPersistedStatus?.state === 'update-error') {
    // The private automation repository is intentionally unreadable to end
    // users. Its six-hour status checker publishes updater failures into
    // repo.json, so a successful download must not erase a fresh orange state.
    result = currentPersistedStatus;
  } else if (download.state === 'available') {
    result = {
      state: 'healthy',
      checkedDownloadURL,
      checkedAt,
      message: 'The latest IPA responded successfully.',
    };
  } else if (currentPersistedStatus) {
    // A temporary offline/device-network failure is inconclusive. Preserve a
    // fresh server-side status instead of repainting the card as a new result.
    result = currentPersistedStatus;
  } else {
    result = {
      state: 'unknown',
      checkedDownloadURL,
      checkedAt,
      ...(download.message ? { message: download.message } : {}),
    };
  }

  appStatusCache.set(cacheKey, { value: result, cachedAt: Date.now() });
  return result;
}

export async function verifyRepositoryAppStatus(
  app: RepoApp,
  options: Pick<VerifyRepositoryAppStatusesOptions, 'signal'> = {},
): Promise<RepoAppStatus> {
  return verifyAppStatus(app, options);
}

/**
 * Verifies apps with a small worker pool and reports each result as it lands.
 * This keeps large repositories responsive and avoids a burst of download-host
 * requests. Workflow health comes from the protected server-side checker.
 */
export async function verifyRepositoryAppStatuses(
  apps: readonly RepoApp[],
  options: VerifyRepositoryAppStatusesOptions = {},
): Promise<Record<string, RepoAppStatus>> {
  const requestedConcurrency = Number.isFinite(options.concurrency)
    ? Math.floor(options.concurrency as number)
    : DEFAULT_VERIFICATION_CONCURRENCY;
  const concurrency = Math.max(1, Math.min(MAX_VERIFICATION_CONCURRENCY, requestedConcurrency));
  const results: Record<string, RepoAppStatus> = Object.create(null);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (!options.signal?.aborted) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= apps.length) return;

      const app = apps[index];
      try {
        const status = await verifyAppStatus(app, { signal: options.signal });
        if (options.signal?.aborted) return;
        const key = getAppStatusKey(app);
        results[key] = status;
        options.onStatus?.({ key, app, status });
      } catch (error) {
        if (options.signal?.aborted || isAbortError(error)) return;
        const key = getAppStatusKey(app);
        const status: RepoAppStatus = {
          state: 'unknown',
          checkedDownloadURL: app.versions[0]?.downloadURL ?? '',
          checkedAt: new Date().toISOString(),
          message: 'The latest IPA could not be verified.',
        };
        results[key] = status;
        options.onStatus?.({ key, app, status });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, apps.length) }, () => worker()));
  return results;
}
