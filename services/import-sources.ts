import { fetch } from 'expo/fetch';
import type { RepoApp, RepoVersion } from '../types/repo';
import type { GitHubReleaseDiscoveryChannel } from '../types/github-release-channel';
import { getSafeExternalHttpsUrl, isSafeExternalHttpsUrl } from './safe-url';
import { queuePrivateImport } from './private-imports';

export const DEFAULT_ICON_URL = 'https://raw.githubusercontent.com/Sami-Wali/ryP0-repository/main/icons/ry0_.jpg';

const REQUEST_TIMEOUT_MS = 20_000;
// A large catalogue may contain thousands of apps and their complete version
// history. Bound bytes while reading, rather than rejecting ordinary catalogues
// at 2 MB after allocating the whole response.
const MAX_REPOSITORY_BYTES = 32 * 1024 * 1024;
const MAX_GITHUB_BYTES = 16 * 1024 * 1024;
const GITHUB_RELEASES_PAGE_SIZE = 100;
const MAX_GITHUB_RELEASE_PAGES = 5;
const GITHUB_CATALOG_CACHE_MS = 2 * 60 * 1000;

type GitHubAsset = {
  name?: string;
  browser_download_url?: string;
  size?: number;
  content_type?: string;
  updated_at?: string;
};

type GitHubRelease = {
  name?: string;
  tag_name?: string;
  published_at?: string;
  created_at?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
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

type GitHubArtifact = {
  id?: number;
  name?: string;
  size_in_bytes?: number;
  archive_download_url?: string;
  expired?: boolean;
  created_at?: string;
};

type GitHubArtifactsResponse = {
  artifacts?: GitHubArtifact[];
};

type GitHubReleaseIpa = {
  release: GitHubRelease;
  asset: GitHubAsset;
  channel: GitHubReleaseDiscoveryChannel;
};

/** One public GitHub release asset the private importer can resolve exactly. */
export type GitHubReleaseImportCandidate = {
  id: string;
  channel: GitHubReleaseDiscoveryChannel;
  releaseTag: string;
  releaseName: string;
  assetName: string;
  downloadURL: string;
  publishedAt: string;
  size: number;
};

export type GitHubImportCatalog = {
  owner: string;
  repository: string;
  candidates: readonly GitHubReleaseImportCandidate[];
  /** GitHub has more than the bounded 500 releases that were inspected. */
  isTruncated: boolean;
};

type GitHubSourceMetadata = {
  app: RepoApp;
  sourceURL: string;
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

const githubImportCatalogCache = new Map<string, {
  expiresAt: number;
  value: GitHubImportCatalog;
}>();

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

async function fetchJson<T>(url: string, init: RequestInit = {}, options: FetchOptions = {}) {
  const text = await fetchText(url, init, options);
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
    if (url.protocol !== 'https:' || (url.hostname !== 'github.com' && url.hostname !== 'www.github.com')) {
      throw new ImportSourceError('Use a github.com repository URL.');
    }
    path = url.pathname;
  }

  const parts = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  const owner = parts[0] || '';
  const repository = (parts[1] || '').replace(/\.git$/i, '');
  if (parts.length !== 2 || !/^[A-Za-z0-9._-]{1,100}$/.test(owner) || !repository || !/^[A-Za-z0-9._-]{1,100}$/.test(repository)) {
    throw new ImportSourceError('Enter a GitHub repository as owner/repository.');
  }
  return { owner, repository };
}

function rawGitHubUrl(owner: string, repository: string, branch: string, path: string) {
  return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/${encodeURIComponent(branch)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function normalizedNameKey(value: unknown) {
  return cleanString(value, 240).toLocaleLowerCase().replace(/[^a-z0-9]+/g, '');
}

function releaseChannel(release: GitHubRelease): GitHubReleaseIpa['channel'] | null {
  if (release.draft) return null;
  const label = `${cleanString(release.name, 240)} ${cleanString(release.tag_name, 240)}`.toLocaleLowerCase();
  // Some projects publish Nightly/Beta builds without checking GitHub's
  // "pre-release" box.  Prefer the explicit release/tag name so users do not
  // accidentally enroll a nightly updater as their stable release source.
  if (/\bbeta\b|(?:^|[-_.])b\d+(?:[-_.]|$)/.test(label)) return 'beta';
  if (/\bnightly\b|\bnight\b/.test(label)) return 'nightly';
  if (/\balpha\b|(?:^|[-_.])a\d+(?:[-_.]|$)/.test(label)) return 'alpha';
  return release.prerelease ? 'prerelease' : 'release';
}

function releaseChannelRank(channel: GitHubReleaseIpa['channel']) {
  switch (channel) {
    case 'release': return 0;
    case 'beta': return 1;
    case 'alpha': return 2;
    case 'nightly': return 3;
    case 'prerelease': return 4;
  }
}

function isSafeIpaAsset(asset: GitHubAsset) {
  return typeof asset.name === 'string'
    && /\.ipa$/i.test(asset.name)
    && isSafeExternalHttpsUrl(asset.browser_download_url);
}

function ipaAssetRank(asset: GitHubAsset) {
  const name = cleanString(asset.name, 240).toLocaleLowerCase();
  return (/(?:ios|iphone|ipad)/.test(name) ? 20 : 0)
    + (/universal/.test(name) ? 10 : 0)
    - (/(?:macos|watchos|tvos|simulator|debug-symbol)/.test(name) ? 30 : 0);
}

function findGitHubReleaseIpa(releases: readonly GitHubRelease[]): GitHubReleaseIpa | null {
  const candidates: (GitHubReleaseIpa & { order: number })[] = [];
  releases.forEach((release, order) => {
    const channel = releaseChannel(release);
    if (!channel) return;
    const assets = (release.assets || []).filter(isSafeIpaAsset)
      .sort((left, right) => ipaAssetRank(right) - ipaAssetRank(left) || cleanString(left.name, 240).localeCompare(cleanString(right.name, 240)));
    const asset = assets[0];
    if (asset) candidates.push({ release, asset, channel, order });
  });
  candidates.sort((left, right) => releaseChannelRank(left.channel) - releaseChannelRank(right.channel) || left.order - right.order);
  const candidate = candidates[0];
  return candidate ? { release: candidate.release, asset: candidate.asset, channel: candidate.channel } : null;
}

function releaseImportCandidates(release: GitHubRelease, order: number): Array<GitHubReleaseImportCandidate & { order: number }> {
  const channel = releaseChannel(release);
  const releaseTag = cleanString(release.tag_name, 128);
  if (!channel || !releaseTag) return [];
  const publishedAt = cleanString(release.published_at || release.created_at, 64);
  return (release.assets || [])
    .filter(isSafeIpaAsset)
    .map((asset) => {
      const downloadURL = asset.browser_download_url!;
      return {
        id: `${releaseTag}\u0000${cleanString(asset.name, 240)}\u0000${downloadURL}`,
        channel,
        releaseTag,
        releaseName: cleanString(release.name || releaseTag, 240),
        assetName: cleanString(asset.name, 240),
        downloadURL,
        publishedAt,
        size: asNonNegativeNumber(asset.size),
        order,
      };
    });
}

/**
 * Reads a bounded public GitHub release catalogue. No GitHub credential is
 * sent from the app: this API is only for public metadata and each chosen IPA
 * is validated again inside private automation before it reaches repo.json.
 */
export async function listGitHubReleaseImportCandidates(
  repositoryReference: string,
  options: { signal?: AbortSignal } = {},
): Promise<GitHubImportCatalog> {
  const { owner, repository } = normalizeGitHubRepository(repositoryReference);
  const cacheKey = `${owner.toLocaleLowerCase()}/${repository.toLocaleLowerCase()}`;
  const cached = githubImportCatalogCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const releases: GitHubRelease[] = [];
  let isTruncated = false;
  for (let page = 1; page <= MAX_GITHUB_RELEASE_PAGES; page += 1) {
    const currentPage = await fetchJson<GitHubRelease[]>(
      `https://api.github.com/repos/${repoPath}/releases?per_page=${GITHUB_RELEASES_PAGE_SIZE}&page=${page}`,
      { credentials: 'omit' },
      { signal: options.signal },
    );
    if (!Array.isArray(currentPage)) {
      throw new ImportSourceError('GitHub returned an invalid release list.');
    }
    releases.push(...currentPage);
    if (currentPage.length < GITHUB_RELEASES_PAGE_SIZE) break;
    if (page === MAX_GITHUB_RELEASE_PAGES) isTruncated = true;
  }

  const seen = new Set<string>();
  const candidates = releases
    .flatMap((release, order) => releaseImportCandidates(release, order))
    .filter((candidate) => {
      if (seen.has(candidate.id)) return false;
      seen.add(candidate.id);
      return true;
    })
    .sort((left, right) => releaseChannelRank(left.channel) - releaseChannelRank(right.channel) || left.order - right.order)
    .map(({ order: _order, ...candidate }) => candidate);

  const value: GitHubImportCatalog = { owner, repository, candidates, isTruncated };
  githubImportCatalogCache.set(cacheKey, { value, expiresAt: Date.now() + GITHUB_CATALOG_CACHE_MS });
  return value;
}

function sourceJsonPathRank(path: string) {
  const depth = path.split('/').length - 1;
  if (/(?:^|\/)repo\.json$/i.test(path)) return depth * 10;
  if (/(?:^|\/)source\.json$/i.test(path)) return 100 + depth * 10;
  return Number.POSITIVE_INFINITY;
}

async function listGitHubTreePaths(owner: string, repository: string, branch: string) {
  const apiBase = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  const tree = await fetchJson<GitHubTree>(`${apiBase}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  return (tree.tree || [])
    .filter((entry) => entry.type === 'blob' && typeof entry.path === 'string')
    .map((entry) => entry.path!);
}

function chooseSourceJsonApp(raw: unknown, targetNames: readonly string[]) {
  const rawApps = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as { apps?: unknown }).apps
    : null;
  if (!Array.isArray(rawApps)) return null;
  const apps = rawApps.map(normalizeRemoteApp).filter((app): app is RepoApp => Boolean(app));
  if (!apps.length) return null;
  if (apps.length === 1) return apps[0];

  const targetKeys = [...new Set(targetNames.map(normalizedNameKey).filter((value) => value.length >= 3))];
  const matches = apps.map((app) => {
    const name = normalizedNameKey(app.name);
    const bundleIdentifier = normalizedNameKey(app.bundleIdentifier);
    let score = 0;
    for (const target of targetKeys) {
      if (name === target) score = Math.max(score, 1_000);
      else if (name.includes(target) || target.includes(name)) score = Math.max(score, 300);
      else if (bundleIdentifier.includes(target)) score = Math.max(score, 100);
    }
    return { app, score };
  }).filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.app.name.localeCompare(right.app.name));

  // Do not guess from a large catalogue. Exact matches are always safe; fuzzy
  // matches only win when they are not tied with another catalogue app.
  if (!matches.length) return null;
  if (matches[0].score >= 1_000) return matches[0].app;
  if (matches.length === 1 || matches[0].score > matches[1].score) return matches[0].app;
  return null;
}

async function findGitHubSourceMetadata(
  owner: string,
  repository: string,
  branch: string,
  paths: readonly string[],
  targetNames: readonly string[],
): Promise<GitHubSourceMetadata | null> {
  // Probe common root names too. Git trees may be truncated for very large
  // repositories, but a root repo.json is still inexpensive to verify.
  const sourcePaths = [...new Set([
    ...paths.filter((path) => Number.isFinite(sourceJsonPathRank(path))),
    'repo.json',
    'Source.JSON',
    'source.json',
  ])]
    .sort((left, right) => sourceJsonPathRank(left) - sourceJsonPathRank(right) || left.localeCompare(right));

  for (const path of sourcePaths) {
    const sourceURL = rawGitHubUrl(owner, repository, branch, path);
    try {
      const source = await fetchJson<unknown>(sourceURL);
      const app = chooseSourceJsonApp(source, targetNames);
      if (app) return { app, sourceURL };
    } catch (error) {
      // Source metadata is optional. A missing or malformed source.json must
      // never prevent a normal GitHub release import.
      if (error instanceof ImportSourceError && error.status !== 404) continue;
    }
  }
  return null;
}

async function findGitHubActionsArtifact(owner: string, repository: string) {
  const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`;
  try {
    const payload = await fetchJson<GitHubArtifactsResponse>(`https://api.github.com/repos/${repoPath}/actions/artifacts?per_page=100`);
    return (payload.artifacts || [])
      .filter((artifact) => !artifact.expired && isSafeExternalHttpsUrl(artifact.archive_download_url))
      .filter((artifact) => /(?:\.ipa$|\bipa\b|\bios\b|\biphone\b)/i.test(cleanString(artifact.name, 240)))
      .sort((left, right) => cleanString(right.created_at, 40).localeCompare(cleanString(left.created_at, 40)))[0] || null;
  } catch {
    // Artifact discovery is a final optional fallback. GitHub may withhold
    // Actions data for a private upstream repository or a rate-limited client.
    return null;
  }
}

function mergedVersions(current: RepoVersion, history: readonly RepoVersion[]) {
  const seen = new Set<string>();
  return [current, ...history].filter((version) => {
    const key = `${version.version}\u0000${version.downloadURL}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

async function findGitHubIcon(owner: string, repository: string, branch: string, knownPaths?: readonly string[]) {
  const rootUrl = rawGitHubUrl(owner, repository, branch, '');
  try {
    const paths = knownPaths?.length ? [...knownPaths] : await listGitHubTreePaths(owner, repository, branch);
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
  const [repositoryInfo, releases] = await Promise.all([
    fetchJson<GitHubRepository>(`https://api.github.com/repos/${repoPath}`),
    (async () => {
      try {
        return await fetchJson<GitHubRelease[]>(`https://api.github.com/repos/${repoPath}/releases?per_page=100`);
      } catch (error) {
        // A repository without releases returns 404. Continue to repo.json
        // and Actions-artifact discovery rather than rejecting it immediately.
        if (error instanceof ImportSourceError && error.status === 404) return [] as GitHubRelease[];
        throw error;
      }
    })(),
  ]);

  const branch = repositoryInfo.default_branch || 'HEAD';
  const paths = await listGitHubTreePaths(owner, repository, branch).catch(() => [] as string[]);
  const releaseIpa = findGitHubReleaseIpa(releases);
  const sourceMetadata = await findGitHubSourceMetadata(
    owner,
    repository,
    branch,
    paths,
    [options.name || '', repositoryInfo.name || '', repository, releaseIpa?.asset.name || ''],
  );
  const sourceVersion = sourceMetadata?.app.versions[0];

  if (!releaseIpa && !sourceVersion) {
    const artifact = await findGitHubActionsArtifact(owner, repository);
    if (artifact) {
      throw new ImportSourceError(
        `Found the GitHub Actions artifact “${cleanString(artifact.name, 120) || 'IPA build'}”. It is a ZIP artifact, so ryP0 automation must verify, extract, and publish its IPA before it can be installed.`,
      );
    }
    throw new ImportSourceError('No secure IPA was found in repo.json, stable releases, beta, nightly, alpha, or public GitHub Actions artifacts.');
  }

  const selectedVersion: RepoVersion = releaseIpa
    ? {
      version: cleanString(releaseIpa.release.tag_name || releaseIpa.release.name, 100).replace(/^v(?=\d)/i, '') || '1.0.0',
      date: cleanString(releaseIpa.release.published_at || releaseIpa.release.created_at, 30).slice(0, 10) || today(),
      downloadURL: releaseIpa.asset.browser_download_url!,
      size: asNonNegativeNumber(releaseIpa.asset.size),
      ...(cleanString(releaseIpa.release.body, 2_000) ? { localizedDescription: cleanString(releaseIpa.release.body, 2_000) } : {}),
    }
    : sourceVersion!;

  const sourceName = sourceMetadata?.app.name || repositoryInfo.name || repository;
  const appName = cleanString(options.name, 120) || sourceName;
  const explicitIcon = cleanString(options.iconURL, 2_000);
  const metadataIcon = sourceMetadata && sourceMetadata.app.iconURL !== DEFAULT_ICON_URL
    ? safeDiscoveredIcon(sourceMetadata.app.iconURL, sourceMetadata.sourceURL)
    : undefined;
  const iconURL = explicitIcon
    ? normalizeHttpsUrl(explicitIcon, 'Icon URL')
    : metadataIcon || await findGitHubIcon(owner, repository, branch, paths);
  const description = cleanString(options.description, 2_000)
    || cleanString(sourceMetadata?.app.localizedDescription || sourceMetadata?.app.subtitle, 2_000)
    || cleanString(releaseIpa?.release.body, 2_000)
    || cleanString(repositoryInfo.description, 2_000)
    || `GitHub ${releaseIpa?.channel || 'source'} import`;

  return {
    name: appName,
    bundleIdentifier: sourceMetadata?.app.bundleIdentifier
      || `com.github.${owner.toLowerCase().replace(/[^a-z0-9]/g, '')}.${repository.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    developerName: sourceMetadata?.app.developerName || cleanString(repositoryInfo.owner?.login, 120) || owner,
    subtitle: description,
    localizedDescription: description,
    iconURL,
    category: cleanString(options.category, 60) || 'Sideloading',
    ...(sourceMetadata ? { automation: { sourceURL: sourceMetadata.sourceURL } } : {}),
    // repo.json records the upstream metadata that the private updater can
    // later track. Do not claim a daily updater exists until automation creates
    // a real protected workflow for this app.
    updatePolicy: 'static',
    versions: mergedVersions(selectedVersion, sourceMetadata?.app.versions || []),
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
  const iconURL = isSafeExternalHttpsUrl(iconCandidate)
    ? safeDiscoveredIcon(iconCandidate, iconCandidate) || DEFAULT_ICON_URL
    : DEFAULT_ICON_URL;
  return {
    name,
    bundleIdentifier,
    developerName: cleanString(app.developerName, 160) || 'Unknown Developer',
    ...(cleanString(app.subtitle, 2_000) ? { subtitle: cleanString(app.subtitle, 2_000) } : {}),
    ...(cleanString(app.localizedDescription, 2_000) ? { localizedDescription: cleanString(app.localizedDescription, 2_000) } : {}),
    iconURL,
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

export type TelegramImportResult = { kind: 'queued'; workflowUrl?: string };

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
  iconURL?: string;
  developerName?: string;
  bundleIdentifier?: string;
}): Promise<TelegramImportResult> {
  const queued = await queuePrivateImport({
    method: 'telegram-r2',
    sourceUrl: input.sourceUrl,
    appName: input.name,
    description: input.description,
    category: input.category,
    iconUrl: input.iconURL,
    developerName: input.developerName,
    expectedBundleIdentifier: input.bundleIdentifier,
    deliveryMode: 'r2',
    updatePolicy: 'daily',
    historyLimit: 1,
    archiveToR2: true,
  });
  return {
    kind: 'queued',
    ...queued,
  };
}

/**
 * Telegram/R2 processing is deliberately delegated to the protected private
 * workflow. The client only authenticates its own workflow dispatch; it never
 * receives the Telegram session, R2 credential, GitHub App key, or catalog
 * publisher credential.
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
    ...(iconURL ? { iconURL } : {}),
    ...(developerName ? { developerName } : {}),
    ...(bundleIdentifier ? { bundleIdentifier } : {}),
  };

  return queueTelegramWorkflow(workflowInput);
}
