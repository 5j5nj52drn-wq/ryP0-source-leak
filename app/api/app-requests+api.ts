import type { AppRequestMethod, AppRequestSubmission } from '../../types/app-request';
import { getSafeExternalHttpsUrl } from '../../services/safe-url';

const OWNER = 'ry0-x';
const REPOSITORY = 'ry0-x.github.io';
const LABEL = 'app-request';
const METHODS: readonly AppRequestMethod[] = ['updatable-source', 'direct-ipa', 'message-link'];
const MAX_BODY_BYTES = 12_000;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const RATE_LIMIT_MAX_REQUESTS = 5;
const GITHUB_TIMEOUT_MS = 12_000;

type GitHubIssue = {
  number: number;
  state: 'open' | 'closed';
  html_url: string;
  created_at: string;
  title: string;
  body: string | null;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

// The Workers runtime may reuse an isolate, so this throttles abusive clients when
// possible. Deploying behind Cloudflare/WAF remains the durable production limit.
const requestRateLimits = new Map<string, RateLimitEntry>();

function responseHeaders(request?: Request, extra: HeadersInit = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  const origin = request?.headers.get('origin');
  const configuredOrigin = process.env.REQUESTS_ALLOWED_ORIGIN?.trim().replace(/\/$/, '');

  // Native requests do not send Origin. For browsers, only same-origin or an
  // explicitly configured origin receives CORS permission.
  if (origin) {
    const requestOrigin = request ? new URL(request.url).origin : '';
    if (origin === requestOrigin || (configuredOrigin && origin === configuredOrigin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
      headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
    }
  }

  return headers;
}

function json(request: Request | undefined, body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request, extra) });
}

function plainText(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function validateRequest(value: unknown): AppRequestSubmission | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const name = plainText(body.name, 120);
  const description = plainText(body.description, 2_000);
  const category = plainText(body.category, 60);
  const sourceUrl = plainText(body.sourceUrl, 2_000);
  const method = plainText(body.method, 40) as AppRequestMethod;

  const safeSourceUrl = getSafeExternalHttpsUrl(sourceUrl);
  if (!name || !description || !category || !safeSourceUrl || !METHODS.includes(method)) {
    return null;
  }
  return { name, description, category, sourceUrl: safeSourceUrl, method };
}

function escapeMarkdown(value: string) {
  return value.replace(/([\\`*_{}[\]<>])/g, '\\$1');
}

function issueBody(request: AppRequestSubmission, requestKey?: string) {
  const methodLabel: Record<AppRequestMethod, string> = {
    'updatable-source': 'Updatable source',
    'direct-ipa': 'Direct IPA download',
    'message-link': 'Message / Telegram link',
  };
  return [
    '<!-- ryp0-app-request -->',
    ...(requestKey ? [`<!-- ryp0-request-key:${requestKey} -->`] : []),
    '## App request',
    `- **Name:** ${escapeMarkdown(request.name)}`,
    `- **Category:** ${escapeMarkdown(request.category)}`,
    `- **Submission method:** ${methodLabel[request.method]}`,
    `- **Source:** <${request.sourceUrl}>`,
    '',
    '## Description',
    escapeMarkdown(request.description),
  ].join('\n');
}

function requestFromIssue(issue: GitHubIssue) {
  const body = issue.body || '';
  const findField = (label: string) => body.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`))?.[1]?.trim() || '';
  const sourceValue = findField('Source');
  const sourceUrl = sourceValue.replace(/^<|>$/g, '');
  const methodLabel = findField('Submission method');
  const method: AppRequestMethod = methodLabel === 'Direct IPA download'
    ? 'direct-ipa'
    : methodLabel === 'Message / Telegram link'
      ? 'message-link'
      : 'updatable-source';
  const description = body.split('## Description')[1]?.trim() || '';

  return {
    id: issue.number,
    name: findField('Name').replace(/\\([\\`*_{}[\]<>])/g, '$1') || issue.title.replace(/^App request:\s*/i, ''),
    category: findField('Category').replace(/\\([\\`*_{}[\]<>])/g, '$1') || 'Uncategorized',
    sourceUrl,
    method,
    description: description.replace(/\\([\\`*_{}[\]<>])/g, '$1'),
    submittedAt: issue.created_at,
    issueUrl: issue.html_url,
    state: issue.state,
  };
}

function clientKey(request: Request) {
  const cloudflareIp = request.headers.get('cf-connecting-ip');
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return cloudflareIp || forwarded || 'anonymous';
}

function consumeRateLimit(request: Request) {
  const key = clientKey(request);
  const now = Date.now();
  const existing = requestRateLimits.get(key);

  if (!existing || existing.resetAt <= now) {
    if (requestRateLimits.size >= 1_024) {
      for (const [candidate, entry] of requestRateLimits) {
        if (entry.resetAt <= now || requestRateLimits.size >= 1_024) requestRateLimits.delete(candidate);
        if (requestRateLimits.size < 900) break;
      }
    }
    requestRateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)) };
  }

  existing.count += 1;
  requestRateLimits.set(key, existing);
  return { allowed: true, retryAfterSeconds: 0 };
}

async function readJsonBody(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new Error('REQUEST_TOO_LARGE');
  }
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    throw new Error('REQUEST_TOO_LARGE');
  }
  return JSON.parse(rawBody);
}

async function github(path: string, init: RequestInit = {}) {
  const token = process.env.GITHUB_REQUESTS_TOKEN;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : 'GitHub request failed.';
    throw new Error(message);
  }
  return payload;
}

function requestKeyFrom(request: Request) {
  const value = request.headers.get('idempotency-key')?.trim().toLowerCase();
  return value && /^[a-f0-9]{64}$/.test(value) ? value : undefined;
}

async function findExistingRequest(requestKey: string): Promise<GitHubIssue | null> {
  const issues = await github(
    `/repos/${OWNER}/${REPOSITORY}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=50`,
  );
  if (!Array.isArray(issues)) return null;
  const marker = `<!-- ryp0-request-key:${requestKey} -->`;
  return (issues as GitHubIssue[]).find(issue => typeof issue.body === 'string' && issue.body.includes(marker)) ?? null;
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: responseHeaders(request) });
}

export async function GET(request: Request) {
  // Request records are read directly from GitHub by verified Developer Mode.
  // Do not turn this server route into a public request inbox.
  return json(
    request,
    { error: 'The request inbox is available only in Developer Mode.' },
    405,
    { Allow: 'POST, OPTIONS' },
  );
}

export async function POST(request: Request) {
  try {
    if (!process.env.GITHUB_REQUESTS_TOKEN) {
      return json(request, { error: 'App requests are not configured on the server.' }, 503);
    }

    const limit = consumeRateLimit(request);
    if (!limit.allowed) {
      return json(
        request,
        { error: 'Too many requests. Please try again later.' },
        429,
        { 'Retry-After': String(limit.retryAfterSeconds) },
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await readJsonBody(request);
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_TOO_LARGE') {
        return json(request, { error: 'The request is too large.' }, 413);
      }
      return json(request, { error: 'Send a valid JSON request body.' }, 400);
    }

    const submission = validateRequest(rawBody);
    if (!submission) {
      return json(request, { error: 'Enter a name, description, category, HTTPS source link, and submission method.' }, 400);
    }

    const requestKey = requestKeyFrom(request);
    if (requestKey) {
      const existing = await findExistingRequest(requestKey);
      if (existing) {
        return json(request, { request: requestFromIssue(existing) }, 200);
      }
    }
    const issue = await github(`/repos/${OWNER}/${REPOSITORY}/issues`, {
      method: 'POST',
      body: JSON.stringify({
        title: `App request: ${submission.name}`,
        body: issueBody(submission, requestKey),
        labels: [LABEL],
      }),
    }) as GitHubIssue;

    return json(request, { request: requestFromIssue(issue) }, 201);
  } catch (error) {
    console.error('App request submission failed', error instanceof Error ? error.message : error);
    return json(request, { error: 'Could not submit this app request. Please try again shortly.' }, 502);
  }
}
