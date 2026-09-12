import { fetch } from 'expo/fetch';
import { AUTOMATION_REPOSITORY, GitHubApiError } from './github-api';
import { dispatchGitHubWorkflow, listGitHubWorkflows } from './github-workflows';
import { getStoredGitHubToken } from './secure-credentials';
import { isSafeExternalHttpsUrl } from './safe-url';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2026-03-10';
const CONFIG_PATH = 'config/apps.json';
const CONFIG_FORMAT = 'ryp0-updater-config/v1';
const MAX_CONFIG_BYTES = 250_000;
const REQUEST_TIMEOUT_MS = 15_000;
const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_BUNDLE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9.-]{0,254}$/;
const SAFE_SHA = /^[a-f0-9]{40}([a-f0-9]{24})?$/i;

type VersionMode = 'tag' | 'tag_without_v' | 'nightly_date' | 'timestamp' | 'embedded';

export interface GitHubReleaseAutomationSource {
  kind: 'github_release';
  repository: string;
  selector: 'latest' | 'latest_prerelease' | 'tag_or_prerelease' | 'stable_ios' | 'first_with_ipa';
  tag?: string;
  assetPattern: string;
  releaseNamePattern?: string;
  versionMode: VersionMode;
}

export interface ArchiveAutomationSource {
  kind: 'archive';
  url: string;
  archive: 'zip';
  timestampFormat?: string;
  versionMode: VersionMode;
}

export interface GitLabReleaseAutomationSource {
  kind: 'gitlab_release';
  apiURL: string;
  assetPattern: string;
  fallbackDownloadURLTemplate?: string;
  sourcePageURL?: string;
  versionMode: VersionMode;
}

export interface ForgejoReleaseAutomationSource {
  kind: 'forgejo_release';
  apiURL: string;
  assetPattern: string;
  versionMode: VersionMode;
}

export interface RepositoryAutomationSource {
  kind: 'repo_json';
  url: string;
  appNamePattern: string;
  versionMode: VersionMode;
}

export interface TelegramAutomationSource {
  kind: 'telegram';
  url: string;
  localPath: 'work/telegram.ipa';
  versionMode: 'embedded';
}

export type AppAutomationSource =
  | GitHubReleaseAutomationSource
  | ArchiveAutomationSource
  | GitLabReleaseAutomationSource
  | ForgejoReleaseAutomationSource
  | RepositoryAutomationSource
  | TelegramAutomationSource;

export interface AppAutomationConfiguration {
  id: string;
  displayName: string;
  bundleIdentifier: string;
  sourceBundleIdentifier: string;
  bundleIdentifierPattern?: string;
  enabled?: boolean;
  source: AppAutomationSource;
  delivery: {
    kind: 'mirror_release';
    assetName: string;
  };
}

export interface AppAutomationSnapshot {
  sha: string;
  apps: AppAutomationConfiguration[];
}

export type AppAutomationMutation = 'update' | 'enable' | 'disable' | 'delete';

interface GitHubContentPayload {
  type?: unknown;
  sha?: unknown;
  size?: unknown;
  encoding?: unknown;
  content?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maximum = 2_048): string {
  if (typeof value !== 'string') {
    throw new GitHubApiError(`${label} is missing from the private automation configuration.`, 0, 'INVALID_RESPONSE');
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new GitHubApiError(`${label} is invalid in the private automation configuration.`, 0, 'INVALID_RESPONSE');
  }
  return normalized;
}

function base64ToUtf8(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function validatePattern(value: unknown, label: string): string {
  // The private updater evaluates Python regular expressions. JavaScript does
  // not understand valid Python forms such as `(?i)`, so the client performs
  // only bounded-text validation and the protected workflow compiles it.
  return requiredString(value, label, 512);
}

function validateUrl(value: unknown, label: string): string {
  const url = requiredString(value, label);
  if (!isSafeExternalHttpsUrl(url)) {
    throw new GitHubApiError(`${label} must be a safe public HTTPS URL.`, 0, 'INVALID_RESPONSE');
  }
  return url;
}

function validateVersionMode(value: unknown): VersionMode {
  if (
    value !== 'tag' &&
    value !== 'tag_without_v' &&
    value !== 'nightly_date' &&
    value !== 'timestamp' &&
    value !== 'embedded'
  ) {
    throw new GitHubApiError('An app updater has an unsupported version mode.', 0, 'INVALID_RESPONSE');
  }
  return value;
}

function validateSource(value: unknown, appId: string): AppAutomationSource {
  if (!isRecord(value)) {
    throw new GitHubApiError(`${appId} has no valid updater source.`, 0, 'INVALID_RESPONSE');
  }
  const versionMode = validateVersionMode(value.versionMode);
  if (value.kind === 'github_release') {
    const repository = requiredString(value.repository, `${appId} GitHub repository`, 180);
    if (!SAFE_REPOSITORY.test(repository)) {
      throw new GitHubApiError(`${appId} has an invalid GitHub repository.`, 0, 'INVALID_RESPONSE');
    }
    const selector = value.selector;
    if (
      selector !== 'latest' &&
      selector !== 'latest_prerelease' &&
      selector !== 'tag_or_prerelease' &&
      selector !== 'stable_ios' &&
      selector !== 'first_with_ipa'
    ) {
      throw new GitHubApiError(`${appId} has an invalid GitHub release selector.`, 0, 'INVALID_RESPONSE');
    }
    return {
      kind: 'github_release',
      repository,
      selector,
      assetPattern: validatePattern(value.assetPattern, `${appId} IPA asset pattern`),
      versionMode,
      ...(typeof value.tag === 'string' ? { tag: requiredString(value.tag, `${appId} release tag`, 180) } : {}),
      ...(typeof value.releaseNamePattern === 'string'
        ? { releaseNamePattern: validatePattern(value.releaseNamePattern, `${appId} release name pattern`) }
        : {}),
    };
  }
  if (value.kind === 'archive') {
    if (value.archive !== 'zip') {
      throw new GitHubApiError(`${appId} supports only ZIP archives.`, 0, 'INVALID_RESPONSE');
    }
    return {
      kind: 'archive',
      url: validateUrl(value.url, `${appId} archive URL`),
      archive: 'zip',
      versionMode,
      ...(typeof value.timestampFormat === 'string'
        ? { timestampFormat: requiredString(value.timestampFormat, `${appId} timestamp format`, 80) }
        : {}),
    };
  }
  if (value.kind === 'gitlab_release') {
    return {
      kind: 'gitlab_release',
      apiURL: validateUrl(value.apiURL, `${appId} GitLab API URL`),
      assetPattern: validatePattern(value.assetPattern, `${appId} IPA asset pattern`),
      versionMode,
      ...(typeof value.fallbackDownloadURLTemplate === 'string'
        ? { fallbackDownloadURLTemplate: validateUrl(value.fallbackDownloadURLTemplate, `${appId} fallback URL`) }
        : {}),
      ...(typeof value.sourcePageURL === 'string'
        ? { sourcePageURL: validateUrl(value.sourcePageURL, `${appId} source page URL`) }
        : {}),
    };
  }
  if (value.kind === 'forgejo_release') {
    return {
      kind: 'forgejo_release',
      apiURL: validateUrl(value.apiURL, `${appId} Forgejo API URL`),
      assetPattern: validatePattern(value.assetPattern, `${appId} IPA asset pattern`),
      versionMode,
    };
  }
  if (value.kind === 'repo_json') {
    return {
      kind: 'repo_json',
      url: validateUrl(value.url, `${appId} repo.json URL`),
      appNamePattern: validatePattern(value.appNamePattern, `${appId} app selector`),
      versionMode,
    };
  }
  if (value.kind === 'telegram') {
    const url = validateUrl(value.url, `${appId} Telegram URL`);
    const hostname = new URL(url).hostname.toLowerCase();
    if (!['t.me', 'www.t.me', 'telegram.me', 'www.telegram.me'].includes(hostname)) {
      throw new GitHubApiError(`${appId} has an invalid Telegram source.`, 0, 'INVALID_RESPONSE');
    }
    if (value.localPath !== 'work/telegram.ipa' || versionMode !== 'embedded') {
      throw new GitHubApiError(`${appId} has an invalid Telegram handoff policy.`, 0, 'INVALID_RESPONSE');
    }
    return { kind: 'telegram', url, localPath: 'work/telegram.ipa', versionMode: 'embedded' };
  }
  throw new GitHubApiError(`${appId} has an unsupported updater source.`, 0, 'INVALID_RESPONSE');
}

function validateApp(value: unknown): AppAutomationConfiguration {
  if (!isRecord(value)) {
    throw new GitHubApiError('The private automation configuration contains an invalid app.', 0, 'INVALID_RESPONSE');
  }
  const id = requiredString(value.id, 'App automation id', 64);
  const bundleIdentifier = requiredString(value.bundleIdentifier, `${id} bundle identifier`, 255);
  const sourceBundleIdentifier = requiredString(
    value.sourceBundleIdentifier,
    `${id} source bundle identifier`,
    255,
  );
  if (
    !SAFE_ID.test(id) ||
    !SAFE_BUNDLE_IDENTIFIER.test(bundleIdentifier) ||
    !SAFE_BUNDLE_IDENTIFIER.test(sourceBundleIdentifier)
  ) {
    throw new GitHubApiError(`${id} has an invalid identity.`, 0, 'INVALID_RESPONSE');
  }
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') {
    throw new GitHubApiError(`${id} has an invalid enabled state.`, 0, 'INVALID_RESPONSE');
  }
  if (!isRecord(value.delivery) || value.delivery.kind !== 'mirror_release') {
    throw new GitHubApiError(`${id} has an invalid release delivery policy.`, 0, 'INVALID_RESPONSE');
  }
  const assetName = requiredString(value.delivery.assetName, `${id} release asset`, 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.ipa$/.test(assetName)) {
    throw new GitHubApiError(`${id} has an invalid release asset name.`, 0, 'INVALID_RESPONSE');
  }
  return {
    id,
    displayName: requiredString(value.displayName, `${id} display name`, 160),
    bundleIdentifier,
    sourceBundleIdentifier,
    ...(typeof value.bundleIdentifierPattern === 'string'
      ? { bundleIdentifierPattern: validatePattern(value.bundleIdentifierPattern, `${id} bundle pattern`) }
      : {}),
    ...(typeof value.enabled === 'boolean' ? { enabled: value.enabled } : {}),
    source: validateSource(value.source, id),
    delivery: { kind: 'mirror_release', assetName },
  };
}

async function getAuthenticationToken(): Promise<string> {
  const token = await getStoredGitHubToken();
  if (!token?.trim()) {
    throw new GitHubApiError('Developer credentials are unavailable. Sign in again in Settings.', 401, 'AUTHENTICATION_FAILED');
  }
  return token.trim();
}

export async function fetchAppAutomationSnapshot(): Promise<AppAutomationSnapshot> {
  const token = await getAuthenticationToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const path = CONFIG_PATH.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${AUTOMATION_REPOSITORY.owner}/${AUTOMATION_REPOSITORY.name}/contents/${path}?ref=${AUTOMATION_REPOSITORY.branch}`,
      {
        credentials: 'omit',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        signal: controller.signal,
      },
    );
    const rawResponse = await response.text();
    let payload: GitHubContentPayload = {};
    try {
      payload = rawResponse ? JSON.parse(rawResponse) as GitHubContentPayload : {};
    } catch {
      throw new GitHubApiError('GitHub returned unreadable app automation data.', response.status, 'INVALID_RESPONSE');
    }
    if (!response.ok) {
      throw new GitHubApiError(
        response.status === 401
          ? 'The GitHub token is invalid or expired.'
          : 'The token cannot read the private ryP0-automation repository.',
        response.status,
        response.status === 401 ? 'AUTHENTICATION_FAILED' : 'INSUFFICIENT_PERMISSION',
      );
    }
    if (
      payload.type !== 'file' ||
      typeof payload.sha !== 'string' ||
      !SAFE_SHA.test(payload.sha) ||
      typeof payload.size !== 'number' ||
      payload.size < 1 ||
      payload.size > MAX_CONFIG_BYTES ||
      payload.encoding !== 'base64' ||
      typeof payload.content !== 'string'
    ) {
      throw new GitHubApiError('GitHub returned an invalid app automation file.', 0, 'INVALID_RESPONSE');
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(base64ToUtf8(payload.content));
    } catch {
      throw new GitHubApiError('The private app automation file is invalid JSON.', 0, 'INVALID_RESPONSE');
    }
    if (!isRecord(decoded) || decoded.format !== CONFIG_FORMAT || !Array.isArray(decoded.apps)) {
      throw new GitHubApiError('The private app automation format is unsupported.', 0, 'INVALID_RESPONSE');
    }
    const apps = decoded.apps.map(validateApp);
    if (!apps.length || new Set(apps.map((app) => app.id)).size !== apps.length) {
      throw new GitHubApiError('The private app automation list is empty or has duplicate IDs.', 0, 'INVALID_RESPONSE');
    }
    return { sha: payload.sha, apps };
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new GitHubApiError(
      timedOut ? 'GitHub took too long to return app automations.' : 'Could not reach GitHub app automations.',
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function workflowIdForPath(path: string): Promise<number> {
  const workflow = (await listGitHubWorkflows()).find((candidate) => candidate.path === path);
  if (!workflow) {
    throw new GitHubApiError('The required private app workflow is not available yet.', 0, 'INVALID_RESPONSE');
  }
  if (workflow.state !== 'active') {
    throw new GitHubApiError('The required private app workflow is disabled.', 0, 'REQUEST_FAILED');
  }
  return workflow.id;
}

export async function runAppAutomation(appId: string): Promise<void> {
  if (!SAFE_ID.test(appId)) {
    throw new GitHubApiError('Choose a valid app automation.', 0, 'REQUEST_FAILED');
  }
  const workflowId = await workflowIdForPath(`.github/workflows/update-app-${appId}.yml`);
  await dispatchGitHubWorkflow(workflowId);
}

export async function queueAppAutomationMutation(
  snapshot: AppAutomationSnapshot,
  action: AppAutomationMutation,
  appId: string,
  replacement?: AppAutomationConfiguration,
): Promise<void> {
  if (!SAFE_SHA.test(snapshot.sha) || !SAFE_ID.test(appId)) {
    throw new GitHubApiError('Reload app automations before changing them.', 0, 'CONFLICT');
  }
  if (action === 'update' && (!replacement || replacement.id !== appId)) {
    throw new GitHubApiError('The replacement app automation is incomplete.', 0, 'REQUEST_FAILED');
  }
  const normalizedReplacement = replacement ? validateApp(replacement) : undefined;
  const workflowId = await workflowIdForPath('.github/workflows/manage-app-automation.yml');
  await dispatchGitHubWorkflow(workflowId, {
    action,
    app_id: appId,
    expected_config_sha: snapshot.sha,
    ...(normalizedReplacement ? { configuration_json: JSON.stringify(normalizedReplacement) } : {}),
  });
}
