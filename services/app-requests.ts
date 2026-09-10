import { fetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import { getStoredGitHubToken } from './secure-credentials';
import type { AppRequestMethod, AppRequestRecord, AppRequestSubmission } from '../types/app-request';

export class AppRequestsError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = 'AppRequestsError';
  }
}

const REQUEST_TIMEOUT_MS = 15_000;
const GITHUB_API_URL = 'https://api.github.com';
const REQUEST_OWNER = 'Sami-Wali';
const REQUEST_REPOSITORY = 'ryP0-automation';
const REQUEST_LABEL = 'app-request';

type GitHubIssue = {
  number: number;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  title: string;
  body: string | null;
  pull_request?: unknown;
};

export type AppRequestSubmissionResult = { kind: 'submitted'; request: AppRequestRecord };

export interface AppRequestApprovalResult {
  request: {
    id: number;
    state: 'queued';
    importMethod: AppRequestMethod;
    category: string;
  };
}

function endpoint(): string {
  // The control API URL is safe to ship, but its credentials stay private.
  // Do not fall back to the old Expo API route: it relied on a source-repo
  // server token and could bypass the private approval boundary.
  const controlApiUrl = process.env.EXPO_PUBLIC_CONTROL_API_URL?.trim().replace(/\/$/, '');
  if (!controlApiUrl) {
    throw new AppRequestsError(
      'App requests are temporarily unavailable because the private control service has not been deployed yet.',
    );
  }

  let url: URL;
  try {
    url = new URL(controlApiUrl);
  } catch {
    throw new AppRequestsError('EXPO_PUBLIC_CONTROL_API_URL must be a valid HTTPS URL.');
  }

  const isLocalDevelopmentHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocalDevelopmentHost && __DEV__)) {
    throw new AppRequestsError('App requests must use a secure HTTPS endpoint.');
  }
  const normalized = url.toString().replace(/\/$/, '');
  return normalized.endsWith('/v1/app-requests') ? normalized : `${normalized}/v1/app-requests`;
}

function approvalEndpoint(issueNumber: number): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new AppRequestsError('Choose a valid app request.');
  }

  const controlApiUrl = process.env.EXPO_PUBLIC_CONTROL_API_URL?.trim().replace(/\/$/, '');
  if (!controlApiUrl) {
    throw new AppRequestsError(
      'Approving requests requires the private control service to be deployed first.',
    );
  }

  let url: URL;
  try {
    url = new URL(controlApiUrl);
  } catch {
    throw new AppRequestsError('EXPO_PUBLIC_CONTROL_API_URL must be a valid HTTPS URL.');
  }

  const isLocalDevelopmentHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocalDevelopmentHost && __DEV__)) {
    throw new AppRequestsError('Request approval must use a secure HTTPS endpoint.');
  }

  const baseUrl = url.toString().replace(/\/$/, '');
  return `${baseUrl}/v1/admin/app-requests/${issueNumber}/approve`;
}

async function request<T>(endpointUrl: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    response = await fetch(endpointUrl, {
      ...init,
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof AppRequestsError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new AppRequestsError(timedOut ? 'The app requests service took too long to respond.' : 'Unable to reach the app requests service. Check your connection.');
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // Preserve the status below even if a proxy returns an HTML error page.
  }

  if (!response.ok) {
    throw new AppRequestsError(payload?.error || 'The app request could not be completed.', response.status);
  }
  return payload as T;
}

function requestFromIssue(issue: GitHubIssue): AppRequestRecord {
  const body = issue.body || '';
  const findField = (label: string) => body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`))?.[1]?.trim() || '';
  const sourceUrl = findField('Source').replace(/^<|>$/g, '');
  const methodLabel = findField('Submission method');
  const method: AppRequestMethod = methodLabel === 'Direct IPA download' || methodLabel === 'Direct URL'
    ? 'direct-url'
    : methodLabel === 'Telegram / R2 import' || methodLabel === 'Message / Telegram link'
      ? 'telegram-r2'
      : (
        methodLabel === 'Another app repository'
        || methodLabel === 'Repository / repo.json import'
        || methodLabel === 'Repository / Source.JSON import'
      )
        ? 'repository'
        : 'github';
  const unescapeMarkdown = (value: string) => value.replace(/\\([\\`*_{}[\]<>])/g, '$1');

  return {
    id: issue.number,
    name: unescapeMarkdown(findField('Name')) || issue.title.replace(/^App request:\s*/i, ''),
    description: unescapeMarkdown(body.split('## Description')[1]?.trim() || ''),
    category: unescapeMarkdown(findField('Category')) || 'Uncategorized',
    sourceUrl,
    method,
    submittedAt: issue.created_at,
    issueUrl: issue.html_url,
    state: issue.state,
  };
}

async function fetchDeveloperInbox(token: string): Promise<AppRequestRecord[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${encodeURIComponent(REQUEST_OWNER)}/${encodeURIComponent(REQUEST_REPOSITORY)}/issues?state=open&labels=${encodeURIComponent(REQUEST_LABEL)}&per_page=50`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      },
    );
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : 'GitHub could not load the request inbox.';
      throw new AppRequestsError(message, response.status);
    }
    if (!Array.isArray(payload)) {
      throw new AppRequestsError('GitHub returned an invalid request inbox.', response.status);
    }
    return payload
      .filter((issue): issue is GitHubIssue => Boolean(issue) && typeof issue === 'object' && !('pull_request' in issue))
      .map(requestFromIssue);
  } catch (error) {
    if (error instanceof AppRequestsError) throw error;
    const timedOut = error instanceof Error && error.name === 'AbortError';
    throw new AppRequestsError(
      timedOut ? 'GitHub took too long to load the request inbox.' : 'Unable to reach GitHub. Check your connection.',
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function submitAppRequest(submission: AppRequestSubmission): Promise<AppRequestSubmissionResult> {
  const endpointUrl = endpoint();
  const normalizedForIdempotency = JSON.stringify({
    ...submission,
    name: submission.name.trim(),
    description: submission.description.trim(),
    category: submission.category.trim(),
    sourceUrl: submission.sourceUrl.trim(),
  });
  const requestKey = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    normalizedForIdempotency,
  );
  const payload = await request<{ request: AppRequestRecord }>(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': requestKey,
    },
    body: JSON.stringify(submission),
  });
  if (!payload?.request || typeof payload.request.id !== 'number') {
    throw new AppRequestsError('The app requests service returned an invalid response.');
  }
  return { kind: 'submitted', request: payload.request };
}

export async function fetchAppRequests(): Promise<AppRequestRecord[]> {
  // The inbox is an admin-only GitHub resource. Reading it directly with the
  // verified Keychain credential avoids exposing every request through a
  // public server endpoint, and requires Face ID in a native build when set up.
  const token = await getStoredGitHubToken();
  if (!token) {
    throw new AppRequestsError('Developer credentials are unavailable. Sign in again in Settings.');
  }
  return fetchDeveloperInbox(token);
}

/**
 * The GitHub token comes from this administrator's device Keychain and is
 * used by the private Worker only to verify the GitHub identity. It is never
 * embedded in the IPA, returned by the Worker, forwarded to Actions, or
 * written to an issue. The Worker dispatches its one fixed importer with a
 * separate GitHub App identity.
 */
export async function approveAppRequest(
  appRequest: Pick<AppRequestRecord, 'id' | 'method' | 'category'>,
  note = '',
): Promise<AppRequestApprovalResult> {
  const token = await getStoredGitHubToken();
  if (!token?.trim()) {
    throw new AppRequestsError('Developer credentials are unavailable. Sign in again in Settings.');
  }

  const payload = await request<AppRequestApprovalResult>(approvalEndpoint(appRequest.id), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      method: appRequest.method,
      category: appRequest.category.trim(),
      ...(note.trim() ? { note: note.trim().slice(0, 1_000) } : {}),
    }),
  });

  if (!payload?.request || payload.request.id !== appRequest.id || payload.request.state !== 'queued') {
    throw new AppRequestsError('The private control service returned an invalid approval response.');
  }
  return payload;
}
