import { fetch } from 'expo/fetch';
import type { RepoApp, RepoVersion } from '../types/repo';
import { dispatchGitHubWorkflow, listGitHubWorkflows } from './github-workflows';

export const DEFAULT_ICON_URL = 'https://raw.githubusercontent.com/ry0-x/ry0-x.github.io/main/icons/ry0_.jpg';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_REPOSITORY_BYTES = 2_000_000;

type GitHubAsset = {
  name?: string;
  browser_download_url?: string;
  size?: number;
};

type GitHubRelease = {
  name?: string;
  tag_name?: string;
  published_at?: string;
  body?: string;
  assets?: GitHubAsset[];
};

type GitHubRepository = {
  name?: string;
  description?: string | null;
  owner?: { login?: string; avatar_url?: string };
};

type GitHubContent = {
  name?: string;
  type?: string;
  download_url?: string | null;
};

type RawRepoVersion = Partial<RepoVersion> & Record<string, unknown>;
type RawRepoApp = Partial<RepoApp> & Record<string, unknown>;

export class ImportSourceError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'ImportSourceError';
  }
}

function hasSafeHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function cleanString(value: unknown, max = 500) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';
}

function asNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchText(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      let message = '';
      try {
        const parsed = JSON.parse(text) as { message?: unknown; error?: unknown };
        message = typeof parsed.message === 'string'
          ? parsed.message
          : typeof parsed.error === 'string'
            ? parsed.error
            : '';
      } catch {
        // Keep the HTTP message below when a server returned a non-JSON response.
      }
      throw new ImportSourceError(message || `Request failed (${response.status}).`, response.status);
    }
    return text;
  } catch (error) {
    if (error instanceof ImportSourceError) throw error;
    const isAbort = error instanceof Error && error.name === 'AbortError';
    throw new ImportSourceError(isAbort ? 'The source took too long to respond.' : 'Unable to reach the source. Check the URL and your connection.');
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson<T>(url: string, init: RequestInit = {}) {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ImportSourceError('The source did not return valid JSON.');
  }
}

export function normalizeHttpsUrl(value: string, label: string) {
  const trimmed = value.trim();
  if (!hasSafeHttpsUrl(trimmed)) {
    throw new ImportSourceError(`${label} must be a secure HTTPS URL.`);
  }
  return trimmed;
}

export function normalizeGitHubRepository(value: string) {
  const input = value.trim();
  if (!input) throw new ImportSourceError('Enter a GitHub repository, for example owner/repository.');

  let path = input;
  if (/^https?:\/\//i.test(path)) {
    let url: URL;
    try {
      url = new URL(path);
    } catch {
      throw new ImportSourceError('Enter a valid GitHub repository URL.');
    }
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') {
      throw new ImportSourceError('Use a github.com repository URL.');
    }
    path = url.pathname;
  }

  const [owner, repository] = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (!owner || !repository || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repository)) {
    throw new ImportSourceError('Enter a GitHub repository as owner/repository.');
  }
  return { owner, repository: repository.replace(/\.git$/i, '') };
}

async function findGitHubIcon(owner: string, repository: string, fallback: string) {
  try {
    const files = await fetchJson<GitHubContent[]>(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/contents`);
    if (!Array.isArray(files)) return fallback;
    const preferred = files.find((file) => (
      file.type === 'file' &&
      typeof file.download_url === 'string' &&
      /(^|[-_.])(app[-_.]?)?(icon|logo)([-_.]?(ios|app))?\.(png|jpe?g|webp)$/i.test(file.name || '')
    ));
    return preferred?.download_url && hasSafeHttpsUrl(preferred.download_url) ? preferred.download_url : fallback;
  } catch {
    return fallback;
  }
}

export type GitHubImportOptions = {
  repository: string;
  name?: string;
  description?: string;
  iconURL?: string;
  category: string;
};

export async function importLatestGitHubRelease(options: GitHubImportOptions): Promise<RepoApp> {
  const { owner, repository } = normalizeGitHubRepository(options.repository);
  const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const [release, repositoryInfo] = await Promise.all([
    fetchJson<GitHubRelease>(`https://api.github.com/repos/${repoPath}/releases/latest`),
    fetchJson<GitHubRepository>(`https://api.github.com/repos/${repoPath}`),
  ]);
  const ipa = release.assets?.find((asset) => (
    typeof asset.name === 'string' &&
    asset.name.toLowerCase().endsWith('.ipa') &&
    hasSafeHttpsUrl(asset.browser_download_url)
  ));
  if (!ipa?.browser_download_url) {
    throw new ImportSourceError('No secure .ipa asset was found in the latest GitHub release.');
  }

  const sourceName = repositoryInfo.name || repository;
  const appName = cleanString(options.name, 120) || sourceName;
  const fallbackIcon = hasSafeHttpsUrl(repositoryInfo.owner?.avatar_url)
    ? repositoryInfo.owner.avatar_url
    : DEFAULT_ICON_URL;
  const explicitIcon = cleanString(options.iconURL, 2_000);
  const iconURL = explicitIcon
    ? normalizeHttpsUrl(explicitIcon, 'Icon URL')
    : await findGitHubIcon(owner, repository, fallbackIcon);
  const description = cleanString(options.description, 2_000)
    || cleanString(release.body, 2_000)
    || cleanString(repositoryInfo.description, 2_000)
    || `Latest GitHub release: ${release.tag_name || 'unknown version'}`;
  const version = cleanString(release.tag_name, 100).replace(/^v(?=\d)/i, '') || '1.0.0';

  return {
    name: appName,
    bundleIdentifier: `com.github.${owner.toLowerCase().replace(/[^a-z0-9]/g, '')}.${repository.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    developerName: cleanString(repositoryInfo.owner?.login, 120) || owner,
    subtitle: description,
    localizedDescription: description,
    iconURL,
    category: cleanString(options.category, 60) || 'Sideloading',
    versions: [{
      version,
      date: cleanString(release.published_at, 30).slice(0, 10) || today(),
      downloadURL: ipa.browser_download_url,
      size: asNonNegativeNumber(ipa.size),
    }],
  };
}

function normalizeVersion(value: unknown): RepoVersion | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const version = value as RawRepoVersion;
  const downloadURL = cleanString(version.downloadURL, 2_000);
  if (!hasSafeHttpsUrl(downloadURL)) return null;
  return {
    version: cleanString(version.version, 100) || '1.0.0',
    date: cleanString(version.date, 30).slice(0, 10) || today(),
    downloadURL,
    size: asNonNegativeNumber(version.size),
    ...(cleanString(version.localizedDescription, 2_000) ? { localizedDescription: cleanString(version.localizedDescription, 2_000) } : {}),
    ...(cleanString(version.minOSVersion, 40) ? { minOSVersion: cleanString(version.minOSVersion, 40) } : {}),
  };
}

export function normalizeRemoteApp(value: unknown): RepoApp | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const app = value as RawRepoApp;
  const name = cleanString(app.name, 120);
  const bundleIdentifier = cleanString(app.bundleIdentifier, 220);
  const versions = Array.isArray(app.versions)
    ? app.versions.map(normalizeVersion).filter((version): version is RepoVersion => Boolean(version))
    : [];
  if (!name || !bundleIdentifier || versions.length === 0) return null;

  const iconCandidate = cleanString(app.iconURL, 2_000);
  return {
    name,
    bundleIdentifier,
    developerName: cleanString(app.developerName, 160) || 'Unknown Developer',
    ...(cleanString(app.subtitle, 2_000) ? { subtitle: cleanString(app.subtitle, 2_000) } : {}),
    ...(cleanString(app.localizedDescription, 2_000) ? { localizedDescription: cleanString(app.localizedDescription, 2_000) } : {}),
    iconURL: hasSafeHttpsUrl(iconCandidate) ? iconCandidate : DEFAULT_ICON_URL,
    ...(cleanString(app.tintColor, 32) ? { tintColor: cleanString(app.tintColor, 32) } : {}),
    ...(cleanString(app.category, 60) ? { category: cleanString(app.category, 60) } : {}),
    versions,
  };
}

export async function extractRepositoryApps(sourceUrl: string): Promise<RepoApp[]> {
  const url = normalizeHttpsUrl(sourceUrl, 'Repository URL');
  const responseText = await fetchText(url);
  if (responseText.length > MAX_REPOSITORY_BYTES) {
    throw new ImportSourceError('The source repo.json is too large to import safely.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new ImportSourceError('The source repository does not contain valid JSON.');
  }
  const rawApps = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as { apps?: unknown }).apps
    : null;
  if (!Array.isArray(rawApps)) {
    throw new ImportSourceError('The source repository must contain an apps array.');
  }

  const uniqueApps = new Map<string, RepoApp>();
  for (const rawApp of rawApps) {
    const app = normalizeRemoteApp(rawApp);
    if (app && !uniqueApps.has(app.bundleIdentifier)) uniqueApps.set(app.bundleIdentifier, app);
  }
  if (!uniqueApps.size) {
    throw new ImportSourceError('No valid apps with secure IPA links were found in this repository.');
  }
  return [...uniqueApps.values()];
}

export type TelegramImportInput = {
  name: string;
  description: string;
  category: string;
  sourceUrl: string;
  iconURL?: string;
  developerName?: string;
  bundleIdentifier?: string;
};

type TelegramImportResponse = { app?: unknown; error?: string };

export type TelegramImportResult =
  | { kind: 'imported'; app: RepoApp }
  | { kind: 'queued'; workflowUrl?: string };

const TELEGRAM_IMPORT_WORKFLOW_PATH = '.github/workflows/telegram_fetch.yml';

function normalizeTelegramSource(value: string) {
  const sourceUrl = normalizeHttpsUrl(value, 'Telegram message link');
  const url = new URL(sourceUrl);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (hostname !== 't.me' && hostname !== 'telegram.me') {
    throw new ImportSourceError('Use a public t.me Telegram message link.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  const channelUsername = segments[0] === 's' ? segments[1] : segments[0];
  const messageId = segments[0] === 's' ? segments[2] : segments[1];
  if (!channelUsername || !/^[A-Za-z0-9_]{5,32}$/.test(channelUsername)) {
    throw new ImportSourceError('The Telegram link must include a valid public channel username.');
  }
  if (!messageId || !/^\d+$/.test(messageId)) {
    throw new ImportSourceError('Paste the link to the exact Telegram message that contains the IPA.');
  }

  return {
    sourceUrl: `https://t.me/${channelUsername}/${messageId}`,
    channelUsername,
  };
}

function optionalWorkflowInput(value: string | undefined, max: number) {
  const cleaned = cleanString(value, max);
  return cleaned || undefined;
}

async function queueTelegramWorkflow(input: {
  name: string;
  description: string;
  category: string;
  sourceUrl: string;
  channelUsername: string;
  iconURL?: string;
  developerName?: string;
  bundleIdentifier?: string;
}): Promise<TelegramImportResult> {
  const workflows = await listGitHubWorkflows();
  const workflow = workflows.find((candidate) => candidate.path === TELEGRAM_IMPORT_WORKFLOW_PATH);
  if (!workflow) {
    throw new ImportSourceError('The Telegram importer workflow is missing from GitHub.');
  }
  if (workflow.state !== 'active') {
    throw new ImportSourceError('The Telegram importer workflow is disabled. Enable it in Manage Apps first.');
  }

  const optionalInputs = {
    icon_url: input.iconURL,
    developer_name: input.developerName,
    bundle_identifier: input.bundleIdentifier,
  };
  await dispatchGitHubWorkflow(workflow.id, {
    source_url: input.sourceUrl,
    channel_username: input.channelUsername,
    app_name: input.name,
    description: input.description,
    category: input.category,
    ...Object.fromEntries(
      Object.entries(optionalInputs).filter((entry): entry is [string, string] => Boolean(entry[1])),
    ),
  });
  return {
    kind: 'queued',
    ...(workflow.htmlUrl ? { workflowUrl: workflow.htmlUrl } : {}),
  };
}

/**
 * Telegram/R2 processing is deliberately delegated to a protected backend. The
 * client never receives the Telegram session or Cloudflare R2 credentials.
 */
export async function importTelegramApp(input: TelegramImportInput): Promise<TelegramImportResult> {
  const name = cleanString(input.name, 120);
  const description = cleanString(input.description, 2_000);
  const category = cleanString(input.category, 60) || 'Sideloading';
  if (!name || !description) {
    throw new ImportSourceError('App name and description are required.');
  }

  const telegramSource = normalizeTelegramSource(input.sourceUrl);
  const iconURL = optionalWorkflowInput(input.iconURL, 2_000);
  if (iconURL) normalizeHttpsUrl(iconURL, 'Icon URL');
  const developerName = optionalWorkflowInput(input.developerName, 160);
  const bundleIdentifier = optionalWorkflowInput(input.bundleIdentifier, 220);
  if (bundleIdentifier && !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleIdentifier)) {
    throw new ImportSourceError('Bundle Identifier must use dot-separated letters, numbers, and hyphens.');
  }

  const workflowInput = {
    name,
    description,
    category,
    sourceUrl: telegramSource.sourceUrl,
    channelUsername: telegramSource.channelUsername,
    ...(iconURL ? { iconURL } : {}),
    ...(developerName ? { developerName } : {}),
    ...(bundleIdentifier ? { bundleIdentifier } : {}),
  };

  const baseUrl = process.env.EXPO_PUBLIC_IMPORT_API_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) {
    return queueTelegramWorkflow(workflowInput);
  }
  const endpoint = normalizeHttpsUrl(baseUrl, 'Telegram import service');
  let response: TelegramImportResponse;
  try {
    response = await fetchJson<TelegramImportResponse>(`${endpoint}/api/telegram-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...input,
        name,
        description,
        category,
        sourceUrl: telegramSource.sourceUrl,
        ...(iconURL ? { iconURL } : {}),
      }),
    });
  } catch (error) {
    // A deployed Expo route can explicitly report that its optional Python
    // worker is absent. Only that deterministic failure is safe to retry via
    // Actions; ambiguous timeouts/5xx errors could otherwise duplicate work.
    if (
      error instanceof ImportSourceError &&
      error.status === 503 &&
      /not configured/i.test(error.message)
    ) {
      return queueTelegramWorkflow(workflowInput);
    }
    throw error;
  }
  const app = normalizeRemoteApp(response.app);
  if (!app) {
    throw new ImportSourceError(response.error || 'The Telegram service returned an invalid app record.');
  }
  return { kind: 'imported', app };
}
