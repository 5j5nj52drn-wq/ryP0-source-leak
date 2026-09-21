import { fetch } from 'expo/fetch';
import { GitHubApiError } from './github-api';
import { getStoredGitHubToken } from './secure-credentials';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15_000;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/i;

export interface GitHubActionBuildCommit {
  sha: string;
  label: string;
  runId: number;
  commitDate?: string;
}

interface GitHubWorkflowRunResponse {
  id?: unknown;
  status?: unknown;
  conclusion?: unknown;
  head_sha?: unknown;
  display_title?: unknown;
  name?: unknown;
  run_number?: unknown;
  created_at?: unknown;
  head_commit?: unknown;
}

interface GitHubWorkflowRunsResponse {
  workflow_runs?: unknown;
}

function text(value: unknown, maximum = 160): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
}

function parseRepository(reference: string): { owner: string; repository: string } | null {
  let path = reference.trim();
  if (/^https:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') return null;
      path = url.pathname;
    } catch {
      return null;
    }
  }
  const parts = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, rawRepository] = parts;
  const repository = rawRepository.replace(/\.git$/i, '');
  if (!repository || !REPOSITORY_PATTERN.test(`${owner}/${repository}`)) return null;
  return { owner, repository };
}

export function isGitHubRepositoryReference(reference: string): boolean {
  return parseRepository(reference) !== null;
}

function errorMessage(payload: unknown): string | null {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) && typeof (payload as { message?: unknown }).message === 'string'
    ? (payload as { message: string }).message
    : null;
}

function commitTimestamp(headCommit: unknown, fallback: unknown): string {
  if (typeof headCommit === 'object' && headCommit !== null && !Array.isArray(headCommit)) {
    const timestamp = text((headCommit as { timestamp?: unknown }).timestamp, 64);
    if (timestamp) return timestamp;
  }
  return text(fallback, 64);
}

async function getDeveloperToken(): Promise<string> {
  try {
    const token = await getStoredGitHubToken();
    if (!token?.trim()) {
      throw new GitHubApiError('Developer credentials are unavailable. Sign in again in Settings.', 401, 'AUTHENTICATION_FAILED');
    }
    return token.trim();
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    throw new GitHubApiError('GitHub credentials could not be unlocked. Try Face ID again.', 0, 'AUTHENTICATION_FAILED');
  }
}

/**
 * Lists distinct commits from the newest successful workflow runs. This only
 * powers a native selector; the private importer repeats the validation before
 * it downloads any artifact.
 */
export async function listGitHubActionBuildCommits(reference: string): Promise<GitHubActionBuildCommit[]> {
  const parsed = parseRepository(reference);
  if (!parsed) {
    throw new GitHubApiError('Enter a GitHub repository first (owner/repository).', 0, 'REQUEST_FAILED');
  }

  const token = await getDeveloperToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/actions/runs?status=success&per_page=30&exclude_pull_requests=true`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': GITHUB_API_VERSION,
        },
        credentials: 'omit',
        signal: controller.signal,
      },
    );
    const raw = await response.text();
    let payload: unknown = null;
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        if (response.ok) {
          throw new GitHubApiError('GitHub returned an unreadable Actions response.', response.status, 'INVALID_RESPONSE');
        }
      }
    }
    if (!response.ok) {
      const message = errorMessage(payload);
      if (response.status === 401) throw new GitHubApiError('The GitHub token is invalid or has expired.', 401, 'AUTHENTICATION_FAILED');
      if (response.status === 403 || response.status === 404) {
        throw new GitHubApiError(message || 'Your GitHub token needs Actions read access for this repository.', response.status, 'INSUFFICIENT_PERMISSION');
      }
      throw new GitHubApiError(message || `GitHub request failed with status ${response.status}.`, response.status, 'REQUEST_FAILED');
    }
    const workflowRuns = typeof payload === 'object' && payload !== null
      ? (payload as GitHubWorkflowRunsResponse).workflow_runs
      : null;
    if (!Array.isArray(workflowRuns)) {
      throw new GitHubApiError('GitHub returned an invalid Actions run list.', response.status, 'INVALID_RESPONSE');
    }

    const commits = new Map<string, GitHubActionBuildCommit>();
    for (const item of workflowRuns) {
      if (typeof item !== 'object' || item === null || Array.isArray(item)) continue;
      const run = item as GitHubWorkflowRunResponse;
      const sha = text(run.head_sha, 40);
      const runId = typeof run.id === 'number' && Number.isSafeInteger(run.id) && run.id > 0 ? run.id : 0;
      if (run.status !== 'completed' || run.conclusion !== 'success' || !COMMIT_PATTERN.test(sha) || !runId || commits.has(sha)) continue;
      const title = text(run.display_title, 70) || text(run.name, 70) || `Run #${typeof run.run_number === 'number' ? run.run_number : runId}`;
      const commitDate = commitTimestamp(run.head_commit, run.created_at);
      commits.set(sha, {
        sha,
        label: `${sha.slice(0, 7)} · ${title}`,
        runId,
        ...(commitDate ? { commitDate } : {}),
      });
    }
    return [...commits.values()];
  } catch (error) {
    if (error instanceof GitHubApiError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new GitHubApiError(
      timedOut ? 'GitHub took too long to load Actions builds. Try again.' : 'Unable to load GitHub Actions builds. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}
