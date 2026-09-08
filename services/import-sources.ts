import { fetch } from 'expo/fetch';
import type { RepoApp, RepoVersion } from '../types/repo';
import { dispatchGitHubWorkflow, listGitHubWorkflows } from './github-workflows';
import { getSafeExternalHttpsUrl, isSafeExternalHttpsUrl } from './safe-url';

export const DEFAULT_ICON_URL = 'https://raw.githubusercontent.com/ry0-x/ry0-x.github.io/main/icons/ry0_.jpg';

const REQUEST_TIMEOUT_MS = 20_000;
// A large catalogue may contain thousands of apps and their complete version
// history. Bound bytes while reading, rather than rejecting ordinary catalogues
// at 2 MB after allocating the whole response.
const MAX_REPOSITORY_BYTES = 32 * 1024 * 1024;
const MAX_GITHUB_BYTES = 16 * 1024 * 1024;

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
  default_branch?: string;
  owner?: { login?: string };
};

type GitHubTree = {
  tree?: { path?: string; type?: string; size?: number }[];
  truncated?: boolean;
};

type RawRepoVersion = Partial<RepoVersion> & Record<string, unknown>;
type RawRepoApp = Partial<RepoApp> & Record<string, unknown>;

export class ImportSourceError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'ImportSourceError';
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

type FetchOptions = { maxBytes?: number; timeoutMs?: number; signal?: AbortSignal };

async function fetchText(url: string, init: RequestInit = {}, options: FetchOptions = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const externalSignal = options.signal || init.signal;
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, options.timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
      signal: controller.signal,
    });
    const maxBytes = options.maxBytes || MAX_GITHUB_BYTES;
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > maxBytes) {
      await response.body?.cancel();
      throw new ImportSourceError(`This source exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB import limit.`);
    }
    const reader = response.body?.getReader();
    let text = '';
    if (reader) {
      const decoder = new TextDecoder();
      const chunks: string[] = [];
      let bytes = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) {
            await reader.cancel();
            throw new ImportSourceError(`This source exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB import limit.`);
          }
          chunks.push(decoder.decode(value, { stream: true }));
        }
        chunks.push(decoder.decode());
        text = chunks.join('');
      } finally {
        reader.releaseLock();
      }
    } else {
      text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw new ImportSourceError('This source is too large to import safely.');
      }
    }
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
    throw new ImportSourceError(isAbort
      ? externalSignal?.aborted ? 'Import cancelled.' : 'The source took too long to respond.'
      : 'Unable to reach the source. Check the URL and your connection.');
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
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
  const normalized = getSafeExternalHttpsUrl(value);
  if (!normalized) {
    throw new ImportSourceError(`${label} must be a secure HTTPS URL.`);
  }
  return normalized;
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

function rawGitHubUrl(owner: string, repository: string, branch: string, path: string) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** Prefer an actual iOS app asset over a repository logo, badge or avatar. */
export function githubIconPathScore(path: string) {
  if (!/\.(png|jpe?g|webp)$/i.test(path)) return -1;
  if (/(?:^|\/)(?:tests?|__tests__|examples?|samples?|screenshots?|badges?|avatars?)(?:\/|[-_.])/i.test(path)) return -1;
  let score = /\.appiconset\//i.test(path) ? 100 : /(?:^|\/)(?:app[-_.]?icon|icon)(?:[-_.@\d]|\.)/i.test(path) ? 60 : /(?:^|\/)(?:logo)(?:[-_.@\d]|\.)/i.test(path) ? 20 : -1;
  if (score < 0) return score;
  if (/1024|marketing/i.test(path)) score += 30;
  if (/ios|iphone|ipad/i.test(path)) score += 15;
  if (/macos|watchos|watch|android|tvOS/i.test(path)) score -= 35;
  if (/dark|tinted|alternate/i.test(path)) score -= 8;
  return score;
}

function safeDiscoveredIcon(value: unknown, baseUrl: string): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim(), baseUrl);
    if (!isSafeExternalHttpsUrl(url.href)) return undefined;
    if (/^(?:avatars\d*\.githubusercontent\.com|(?:www\.)?gravatar\.com)$/i.test(url.hostname)) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

async function findGitHubIcon(owner: string, repository: string, branch: string) {
  const rootUrl = rawGitHubUrl(owner, repository, branch, '');
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  try {
    const tree = await fetchJson<GitHubTree>(`${apiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const paths = (tree.tree || []).filter((entry) => entry.type === 'blob' && typeof entry.path === 'string').map((entry) => entry.path!);
    const candidates = paths.map((path) => ({ path, score: githubIconPathScore(path) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path));

    // Asset catalog Contents.json explicitly identifies the marketing/universal
    // icon, including projects whose PNG filenames are arbitrary UUIDs.
    const catalogue = paths.find((path) => /\.appiconset\/Contents\.json$/i.test(path) && !/macos|watchos|tvos|tests?|examples?/i.test(path));
    if (catalogue) {
      try {
        const contents = await fetchJson<{ images?: { filename?: string; idiom?: string; size?: string; appearances?: unknown[] }[] }>(new URL(catalogue, rootUrl).href);
        const image = contents.images?.filter((item) => item.filename && !item.appearances?.length)
          .sort((a, b) => {
            const score = (item: typeof a) => (item.idiom === 'ios-marketing' ? 2000 : item.idiom === 'universal' ? 1500 : 0) + (Number.parseInt(item.size || '0', 10) || 0);
            return score(b) - score(a);
          })[0];
        const discovered = image?.filename && safeDiscoveredIcon(image.filename, new URL(catalogue, rootUrl).href);
        if (discovered) return discovered;
      } catch { /* A malformed optional asset catalog must not stop the import. */ }
    }
    if (candidates[0]?.score >= 60) return new URL(candidates[0].path, rootUrl).href;

    const expoConfig = paths.find((path) => /^(?:app\.json|app\.config\.json)$/i.test(path));
    if (expoConfig) {
      try {
        const config = await fetchJson<{ expo?: { icon?: string; ios?: { icon?: string | { light?: string } } } }>(new URL(expoConfig, rootUrl).href);
        const iosIcon = config.expo?.ios?.icon;
        const discovered = safeDiscoveredIcon(typeof iosIcon === 'string' ? iosIcon : iosIcon?.light || config.expo?.icon, rootUrl);
        if (discovered) return discovered;
      } catch { /* Continue to other repository-owned assets. */ }
    }
    if (candidates[0]) return new URL(candidates[0].path, rootUrl).href;

    // README fallback only accepts images explicitly labelled as an app icon or
    // logo; build badges and the developer's profile image are never candidates.
    const readme = paths.find((path) => /^readme\.md$/i.test(path));
    if (readme) {
      const markdown = await fetchText(new URL(readme, rootUrl).href, {}, { maxBytes: 1024 * 1024 });
      const markdownIcon = markdown.match(/!\[[^\]]*(?:app\s*icon|logo)[^\]]*\]\(([^\s)]+)(?:\s+[^)]*)?\)/i)?.[1];
      const htmlIcon = [...markdown.matchAll(/<img\b[^>]*>/gi)].find((match) => /(?:alt|title)=["'][^"']*(?:app\s*icon|logo)[^"']*["']/i.test(match[0]))?.[0].match(/src=["']([^"']+)["']/i)?.[1];
      const discovered = safeDiscoveredIcon(markdownIcon || htmlIcon, rootUrl);
      if (discovered) return discovered;
    }
  } catch {
    // GitHub rate limits and optional discovery failures leave a neutral app
    // placeholder, never the unrelated developer's profile photo.
  }
  return DEFAULT_ICON_URL;
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
    isSafeExternalHttpsUrl(asset.browser_download_url)
  ));
  if (!ipa?.browser_download_url) {
    throw new ImportSourceError('No secure .ipa asset was found in the latest GitHub release.');
  }

  const sourceName = repositoryInfo.name || repository;
  const appName = cleanString(options.name, 120) || sourceName;
  const explicitIcon = cleanString(options.iconURL, 2_000);
  const iconURL = explicitIcon
    ? normalizeHttpsUrl(explicitIcon, 'Icon URL')
    : await findGitHubIcon(owner, repository, repositoryInfo.default_branch || 'HEAD');
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
    updatePolicy: 'static',
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
  if (!isSafeExternalHttpsUrl(downloadURL)) return null;
  return {
    version: cleanString(version.version, 100) || '1.0.0',
    date: cleanString(version.date || version.versionDate, 40) || '',
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
  // Legacy AltStore/SideStore sources put the latest version fields directly on
  // the app rather than in a versions array.
  if (!versions.length) {
    const legacyVersion = normalizeVersion(app);
    if (legacyVersion) versions.push(legacyVersion);
  }
  if (!name || !bundleIdentifier || versions.length === 0) return null;

  const iconCandidate = cleanString(app.iconURL, 2_000);
  return {
    name,
    bundleIdentifier,
    developerName: cleanString(app.developerName, 160) || 'Unknown Developer',
    ...(cleanString(app.subtitle, 2_000) ? { subtitle: cleanString(app.subtitle, 2_000) } : {}),
    ...(cleanString(app.localizedDescription, 2_000) ? { localizedDescription: cleanString(app.localizedDescription, 2_000) } : {}),
    iconURL: isSafeExternalHttpsUrl(iconCandidate) ? iconCandidate : DEFAULT_ICON_URL,
    ...(cleanString(app.tintColor, 32) ? { tintColor: cleanString(app.tintColor, 32) } : {}),
    ...(cleanString(app.category, 60) ? { category: cleanString(app.category, 60) } : {}),
    versions,
    // Importing another source copies its releases; it does not create a daily
    // automation in this repository, even if the source claims to have one.
    updatePolicy: 'static',
  };
}

export async function extractRepositoryApps(sourceUrl: string, options: { signal?: AbortSignal } = {}): Promise<RepoApp[]> {
  const url = normalizeHttpsUrl(sourceUrl, 'Repository URL');
  const responseText = await fetchText(url, {}, { maxBytes: MAX_REPOSITORY_BYTES, timeoutMs: 90_000, signal: options.signal });

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
  for (let index = 0; index < rawApps.length; index++) {
    if (options.signal?.aborted) throw new ImportSourceError('Import cancelled.');
    const rawApp = rawApps[index];
    const app = normalizeRemoteApp(rawApp);
    if (app && !uniqueApps.has(app.bundleIdentifier)) uniqueApps.set(app.bundleIdentifier, app);
    // Give keyboard, progress and cancellation events time on the JS thread
    // while normalizing catalogues with thousands of apps.
    if (index > 0 && index % 200 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
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
