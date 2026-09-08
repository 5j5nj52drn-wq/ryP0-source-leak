import { fetch } from 'expo/fetch';
import { AUTOMATION_REPOSITORY, GitHubApiError } from './github-api';
import { getStoredGitHubToken } from './secure-credentials';

const GITHUB_API_URL = 'https://api.github.com';
const GITHUB_API_VERSION = '2022-11-28';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_WORKFLOW_CONTENT_BYTES = 250_000;
const MAX_WORKFLOW_COMMIT_MESSAGE_LENGTH = 140;
const MAX_WORKFLOW_INPUTS = 20;
const MAX_WORKFLOW_INPUT_LENGTH = 8_192;

const WORKFLOW_PATH_PATTERN = /^\.github\/workflows\/[A-Za-z0-9][A-Za-z0-9._+-]{0,119}\.ya?ml$/i;
const GIT_SHA_PATTERN = /^[a-f0-9]{40,64}$/i;
const WORKFLOW_INPUT_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

export type GitHubWorkflowState =
  | 'active'
  | 'disabled_manually'
  | 'disabled_inactivity'
  | 'disabled_fork'
  | 'unknown';

export interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: GitHubWorkflowState;
  htmlUrl?: string;
  badgeUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GitHubWorkflowRun {
  id: number;
  workflowId: number;
  name?: string;
  displayTitle?: string;
  status: string;
  conclusion: string | null;
  event?: string;
  htmlUrl?: string;
  runNumber?: number;
  createdAt?: string;
  updatedAt?: string;
  headBranch?: string;
}

export interface GitHubWorkflowFile {
  path: string;
  sha: string;
  content: string;
  size: number;
}

export interface GitHubWorkflowSaveResult {
  contentSha: string;
  commitSha?: string;
}

interface WorkflowListResponse {
  workflows?: unknown;
}

interface WorkflowRunsResponse {
  workflow_runs?: unknown;
}

interface GitHubContentResponse {
  type?: unknown;
  path?: unknown;
  sha?: unknown;
  size?: unknown;
  encoding?: unknown;
  content?: unknown;
}

interface GitHubContentMutationResponse {
  content?: {
    sha?: unknown;
  } | null;
  commit?: {
    sha?: unknown;
  } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
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

function repositoryPath(suffix: string): string {
  return `/repos/${encodeURIComponent(AUTOMATION_REPOSITORY.owner)}/${encodeURIComponent(AUTOMATION_REPOSITORY.name)}${suffix}`;
}

function normalizeWorkflowState(value: unknown): GitHubWorkflowState {
  switch (value) {
    case 'active':
    case 'disabled_manually':
    case 'disabled_inactivity':
    case 'disabled_fork':
      return value;
    default:
      return 'unknown';
  }
}

function assertWorkflowId(workflowId: number): void {
  if (!Number.isSafeInteger(workflowId) || workflowId <= 0) {
    throw new GitHubApiError('Choose a valid GitHub Actions workflow.', 0, 'REQUEST_FAILED');
  }
}

function assertWorkflowSha(sha: string): void {
  if (!GIT_SHA_PATTERN.test(sha.trim())) {
    throw new GitHubApiError('The workflow changed on GitHub. Reload it before saving.', 0, 'CONFLICT');
  }
}

/** Returns true only for repository workflow files that are safe to read or mutate. */
export function isGitHubWorkflowPath(path: string): boolean {
  return typeof path === 'string' &&
    path.length <= 160 &&
    !path.includes('\\') &&
    !path.includes('..') &&
    !path.includes('\0') &&
    WORKFLOW_PATH_PATTERN.test(path);
}

function assertWorkflowPath(path: string): string {
  const normalizedPath = path.trim();
  if (!isGitHubWorkflowPath(normalizedPath)) {
    throw new GitHubApiError(
      'Workflow files must be .yml or .yaml files inside .github/workflows.',
      0,
      'REQUEST_FAILED',
    );
  }
  return normalizedPath;
}

function normalizeCommitMessage(message: string | undefined, fallback: string): string {
  const candidate = (message ?? fallback).trim().replace(/\s+/g, ' ');

  if (
    !candidate ||
    candidate.length > MAX_WORKFLOW_COMMIT_MESSAGE_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(candidate)
  ) {
    throw new GitHubApiError(
      `Workflow commit messages must be a single line of up to ${MAX_WORKFLOW_COMMIT_MESSAGE_LENGTH} characters.`,
      0,
      'REQUEST_FAILED',
    );
  }

  return candidate;
}

function normalizeWorkflowContent(content: string): string {
  if (typeof content !== 'string') {
    throw new GitHubApiError('Workflow content must be text.', 0, 'REQUEST_FAILED');
  }

  const normalizedContent = content.replace(/\r\n?/g, '\n');
  const byteLength = new TextEncoder().encode(normalizedContent).byteLength;

  if (!normalizedContent.trim() || normalizedContent.includes('\0')) {
    throw new GitHubApiError('Workflow content cannot be empty or contain null characters.', 0, 'REQUEST_FAILED');
  }

  if (byteLength > MAX_WORKFLOW_CONTENT_BYTES) {
    throw new GitHubApiError(
      `Workflow content must be smaller than ${MAX_WORKFLOW_CONTENT_BYTES / 1000} KB.`,
      0,
      'REQUEST_FAILED',
    );
  }

  const hasTrigger = /(?:^|\n)\s*(?:on|['\"]on['\"])\s*:/m.test(normalizedContent);
  const hasJobs = /(?:^|\n)\s*jobs\s*:/m.test(normalizedContent);
  if (!hasTrigger || !hasJobs) {
    throw new GitHubApiError(
      'A GitHub Actions workflow must include both an on: trigger and jobs: section.',
      0,
      'REQUEST_FAILED',
    );
  }

  // `apps[0]` silently targets a different app after a user reorders repo.json.
  // Workflow mutations must use a stable selector such as bundleIdentifier instead.
  if (/\.apps\s*\[\s*\d+\s*\]/.test(normalizedContent)) {
    throw new GitHubApiError(
      'This workflow updates repo.json by array position. Replace apps[index] with a stable bundleIdentifier selector before saving.',
      0,
      'REQUEST_FAILED',
    );
  }

  return normalizedContent.endsWith('\n') ? normalizedContent : `${normalizedContent}\n`;
}

function normalizeWorkflowInputs(inputs: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!inputs) {
    return undefined;
  }

  const entries = Object.entries(inputs);
  if (entries.length > MAX_WORKFLOW_INPUTS) {
    throw new GitHubApiError('Too many workflow inputs were supplied.', 0, 'REQUEST_FAILED');
  }

  const normalizedInputs: Record<string, string> = {};
  for (const [key, rawValue] of entries) {
    if (!WORKFLOW_INPUT_NAME_PATTERN.test(key) || typeof rawValue !== 'string') {
      throw new GitHubApiError('Workflow inputs contain an invalid name or value.', 0, 'REQUEST_FAILED');
    }

    const value = rawValue.trim();
    if (!value || value.includes('\0') || new TextEncoder().encode(value).byteLength > MAX_WORKFLOW_INPUT_LENGTH) {
      throw new GitHubApiError('A workflow input is empty or too large.', 0, 'REQUEST_FAILED');
    }
    normalizedInputs[key] = value;
  }

  return normalizedInputs;
}

async function getAuthenticationToken(): Promise<string> {
  try {
    const token = await getStoredGitHubToken();
    if (!token?.trim()) {
      throw new GitHubApiError('Developer credentials are unavailable. Sign in again in Settings.', 401, 'AUTHENTICATION_FAILED');
    }
    return token.trim();
  } catch (error) {
    if (error instanceof GitHubApiError) {
      throw error;
    }
    throw new GitHubApiError('GitHub credentials could not be unlocked. Try Face ID again.', 0, 'AUTHENTICATION_FAILED');
  }
}

async function githubActionsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthenticationToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-GitHub-Api-Version', GITHUB_API_VERSION);
  if (init.body) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      ...init,
      credentials: 'omit',
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
          'The workflow changed since it was loaded. Reload it before saving so newer changes are not overwritten.',
          409,
          'CONFLICT',
        );
      }

      if (
        response.status === 429 ||
        (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
      ) {
        throw new GitHubApiError('GitHub rate limit reached. Try again after it resets.', response.status, 'RATE_LIMITED');
      }

      if (response.status === 403 || response.status === 404) {
        throw new GitHubApiError(
          apiMessage || 'The token does not have access to this repository or workflow. To edit workflow files, grant Actions/workflows write permission (or the classic workflow scope) as well as Contents write access.',
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

    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new GitHubApiError(
      timedOut
        ? 'GitHub took too long to respond. Check your connection and try again.'
        : 'Unable to reach GitHub. Check your connection and try again.',
      0,
      'NETWORK_ERROR',
    );
  } finally {
    clearTimeout(timeout);
  }
}

function workflowFromPayload(value: unknown): GitHubWorkflow | null {
  if (!isRecord(value) || !isSafePositiveInteger(value.id) || !isNonEmptyString(value.name) || !isNonEmptyString(value.path)) {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    path: value.path,
    state: normalizeWorkflowState(value.state),
    ...(isNonEmptyString(value.html_url) ? { htmlUrl: value.html_url } : {}),
    ...(isNonEmptyString(value.badge_url) ? { badgeUrl: value.badge_url } : {}),
    ...(isNonEmptyString(value.created_at) ? { createdAt: value.created_at } : {}),
    ...(isNonEmptyString(value.updated_at) ? { updatedAt: value.updated_at } : {}),
  };
}

function workflowRunFromPayload(value: unknown): GitHubWorkflowRun | null {
  if (
    !isRecord(value) ||
    !isSafePositiveInteger(value.id) ||
    !isSafePositiveInteger(value.workflow_id) ||
    !isNonEmptyString(value.status)
  ) {
    return null;
  }

  return {
    id: value.id,
    workflowId: value.workflow_id,
    status: value.status,
    conclusion: typeof value.conclusion === 'string' || value.conclusion === null ? value.conclusion : null,
    ...(isNonEmptyString(value.name) ? { name: value.name } : {}),
    ...(isNonEmptyString(value.display_title) ? { displayTitle: value.display_title } : {}),
    ...(isNonEmptyString(value.event) ? { event: value.event } : {}),
    ...(isNonEmptyString(value.html_url) ? { htmlUrl: value.html_url } : {}),
    ...(isSafePositiveInteger(value.run_number) ? { runNumber: value.run_number } : {}),
    ...(isNonEmptyString(value.created_at) ? { createdAt: value.created_at } : {}),
    ...(isNonEmptyString(value.updated_at) ? { updatedAt: value.updated_at } : {}),
    ...(isNonEmptyString(value.head_branch) ? { headBranch: value.head_branch } : {}),
  };
}

/** Lists every Actions workflow the authenticated developer can manage. */
export async function listGitHubWorkflows(): Promise<GitHubWorkflow[]> {
  const payload = await githubActionsRequest<WorkflowListResponse>(
    repositoryPath('/actions/workflows?per_page=100'),
  );

  if (!Array.isArray(payload.workflows)) {
    throw new GitHubApiError('GitHub returned an invalid workflow list.', 0, 'INVALID_RESPONSE');
  }

  return payload.workflows
    .map(workflowFromPayload)
    .filter((workflow): workflow is GitHubWorkflow => workflow !== null)
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** Retrieves the most recent run for a workflow, or null when it has never run. */
export async function getLatestGitHubWorkflowRun(workflowId: number): Promise<GitHubWorkflowRun | null> {
  assertWorkflowId(workflowId);
  const payload = await githubActionsRequest<WorkflowRunsResponse>(
    repositoryPath(`/actions/workflows/${workflowId}/runs?per_page=1&exclude_pull_requests=true`),
  );

  if (!Array.isArray(payload.workflow_runs)) {
    throw new GitHubApiError('GitHub returned an invalid workflow run list.', 0, 'INVALID_RESPONSE');
  }

  return workflowRunFromPayload(payload.workflow_runs[0]) ?? null;
}

/** Reads a workflow source file and its SHA for optimistic, conflict-safe saving. */
export async function readGitHubWorkflowFile(workflowPath: string): Promise<GitHubWorkflowFile> {
  const path = assertWorkflowPath(workflowPath);
  const payload = await githubActionsRequest<GitHubContentResponse>(
    repositoryPath(`/contents/${encodePath(path)}?ref=${encodeURIComponent(AUTOMATION_REPOSITORY.branch)}`),
  );

  if (
    payload.type !== 'file' ||
    !isNonEmptyString(payload.path) ||
    !isGitHubWorkflowPath(payload.path) ||
    !isNonEmptyString(payload.sha) ||
    typeof payload.size !== 'number' ||
    !Number.isSafeInteger(payload.size) ||
    payload.size < 0 ||
    payload.encoding !== 'base64' ||
    !isNonEmptyString(payload.content)
  ) {
    throw new GitHubApiError('GitHub did not return a readable workflow file.', 0, 'INVALID_RESPONSE');
  }

  let content: string;
  try {
    content = base64ToUtf8(payload.content);
  } catch {
    throw new GitHubApiError('GitHub returned unreadable workflow source.', 0, 'INVALID_RESPONSE');
  }

  return {
    path: payload.path,
    sha: payload.sha,
    content,
    size: payload.size,
  };
}

/** Writes a workflow file with the currently loaded SHA, so concurrent edits cannot be overwritten. */
export async function saveGitHubWorkflowFile(
  workflowPath: string,
  content: string,
  expectedSha: string,
  message?: string,
): Promise<GitHubWorkflowSaveResult> {
  const path = assertWorkflowPath(workflowPath);
  assertWorkflowSha(expectedSha);
  const normalizedContent = normalizeWorkflowContent(content);
  const filename = path.split('/').at(-1) ?? 'workflow';
  const commitMessage = normalizeCommitMessage(message, `Update ${filename} via ryP0 CMS`);
  const payload = await githubActionsRequest<GitHubContentMutationResponse>(
    repositoryPath(`/contents/${encodePath(path)}`),
    {
      method: 'PUT',
      body: JSON.stringify({
        message: commitMessage,
        content: utf8ToBase64(normalizedContent),
        sha: expectedSha.trim(),
        branch: AUTOMATION_REPOSITORY.branch,
      }),
    },
  );
  const contentSha = payload.content?.sha;

  if (!isNonEmptyString(contentSha)) {
    throw new GitHubApiError('GitHub accepted the workflow update but did not return the new file SHA.', 0, 'INVALID_RESPONSE');
  }

  return {
    contentSha,
    ...(isNonEmptyString(payload.commit?.sha) ? { commitSha: payload.commit.sha } : {}),
  };
}

/** Starts a workflow on the repository default branch with optional validated dispatch inputs. */
export async function dispatchGitHubWorkflow(
  workflowId: number,
  inputs?: Record<string, string>,
): Promise<void> {
  assertWorkflowId(workflowId);
  const normalizedInputs = normalizeWorkflowInputs(inputs);
  await githubActionsRequest<null>(repositoryPath(`/actions/workflows/${workflowId}/dispatches`), {
    method: 'POST',
    body: JSON.stringify({
      ref: AUTOMATION_REPOSITORY.branch,
      ...(normalizedInputs && Object.keys(normalizedInputs).length > 0 ? { inputs: normalizedInputs } : {}),
    }),
  });
}

/** Enables or disables an Actions workflow without editing its source. */
export async function setGitHubWorkflowEnabled(workflowId: number, enabled: boolean): Promise<void> {
  assertWorkflowId(workflowId);
  await githubActionsRequest<null>(
    repositoryPath(`/actions/workflows/${workflowId}/${enabled ? 'enable' : 'disable'}`),
    { method: 'PUT' },
  );
}

/** Deletes a workflow source file from the configured repository. */
export async function deleteGitHubWorkflowFile(
  workflowPath: string,
  expectedSha: string,
  message?: string,
): Promise<{ commitSha?: string }> {
  const path = assertWorkflowPath(workflowPath);
  assertWorkflowSha(expectedSha);
  const filename = path.split('/').at(-1) ?? 'workflow';
  const commitMessage = normalizeCommitMessage(message, `Delete ${filename} via ryP0 CMS`);
  const payload = await githubActionsRequest<GitHubContentMutationResponse>(
    repositoryPath(`/contents/${encodePath(path)}`),
    {
      method: 'DELETE',
      body: JSON.stringify({
        message: commitMessage,
        sha: expectedSha.trim(),
        branch: AUTOMATION_REPOSITORY.branch,
      }),
    },
  );

  return isNonEmptyString(payload.commit?.sha) ? { commitSha: payload.commit.sha } : {};
}
