import { fetch } from 'expo/fetch';
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
const REQUEST_OWNER = 'ry0-x';
const REQUEST_REPOSITORY = 'ry0-x.github.io';
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

export type AppRequestSubmissionResult =
  | { kind: 'submitted'; request: AppRequestRecord }
  | { kind: 'continue-in-github'; url: string };

const GITHUB_ISSUE_FORM_URL = `https://github.com/${REQUEST_OWNER}/${REQUEST_REPOSITORY}/issues/new`;

const REQUEST_METHOD_LABELS: Record<AppRequestMethod, string> = {
  'updatable-source': 'Updatable source',
  'direct-ipa': 'Direct IPA download',
  'message-link': 'Message / Telegram link',
};

function endpoint(): string | null {
  const baseUrl = process.env.EXPO_PUBLIC_REQUESTS_API_URL?.trim().replace(/\/$/, '');
  if (!baseUrl) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AppRequestsError('EXPO_PUBLIC_REQUESTS_API_URL must be a valid HTTPS URL.');
  }

  const isLocalDevelopmentHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(isLocalDevelopmentHost && __DEV__)) {
    throw new AppRequestsError('App requests must use a secure HTTPS endpoint.');
  }
  return `${url.toString().replace(/\/$/, '')}/api/app-requests`;
}

function githubIssueFormUrl(submission: AppRequestSubmission): string {
  const url = new URL(GITHUB_ISSUE_FORM_URL);
  url.searchParams.set('template', 'app-request.yml');
  url.searchParams.set('name', submission.name);
  url.searchParams.set('description', submission.description);
  url.searchParams.set('category', submission.category);
  url.searchParams.set('source_url', submission.sourceUrl);
  url.searchParams.set('method', REQUEST_METHOD_LABELS[submission.method]);
  return url.toString();
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
  const method: AppRequestMethod = methodLabel === 'Direct IPA download'
    ? 'direct-ipa'
    : methodLabel === 'Message / Telegram link'
      ? 'message-link'
      : 'updatable-source';
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
  if (!endpointUrl) {
    // A reader must never supply the app with a GitHub token. When a hosted
    // endpoint has not been deployed yet, GitHub owns the sign-in and submit
    // step through the repository's public issue form instead.
    return { kind: 'continue-in-github', url: githubIssueFormUrl(submission) };
  }

  const payload = await request<{ request: AppRequestRecord }>(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
