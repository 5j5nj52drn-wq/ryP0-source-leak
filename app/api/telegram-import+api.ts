import { getSafeExternalHttpsUrl } from '../../services/safe-url';

const MAX_BODY_BYTES = 8_000;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;
const RATE_LIMIT_MAX_REQUESTS = 3;
const UPSTREAM_TIMEOUT_MS = 15_000;
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function headersFor(request: Request, extra: HeadersInit = {}) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  const origin = request.headers.get('origin');
  const configuredOrigin = process.env.REQUESTS_ALLOWED_ORIGIN?.trim().replace(/\/$/, '');
  if (origin && (origin === new URL(request.url).origin || origin === configuredOrigin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return headers;
}

function json(request: Request, body: unknown, status = 200, extra: HeadersInit = {}) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(request, extra) });
}

function telegramUrl(value: unknown) {
  const url = getSafeExternalHttpsUrl(value);
  if (!url) return null;
  const host = new URL(url).hostname.toLowerCase();
  const supportedHost = host === 't.me' || host.endsWith('.t.me') || host === 'telegram.me' || host.endsWith('.telegram.me');
  return supportedHost ? url : null;
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : '';
}

function rateLimit(request: Request) {
  const key = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const now = Date.now();
  const item = rateLimits.get(key);
  if (!item || item.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (item.count >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((item.resetAt - now) / 1_000)) };
  }
  item.count += 1;
  rateLimits.set(key, item);
  return { allowed: true, retryAfter: 0 };
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: headersFor(request) });
}

export async function POST(request: Request) {
  const serviceUrl = process.env.TELEGRAM_IMPORT_SERVICE_URL?.trim();
  const serviceToken = process.env.TELEGRAM_IMPORT_SERVICE_TOKEN?.trim();
  if (!serviceUrl || !serviceToken) {
    return json(request, { error: 'Telegram importing is not configured on the server.' }, 503);
  }

  const limited = rateLimit(request);
  if (!limited.allowed) {
    return json(request, { error: 'Too many Telegram import attempts. Try again later.' }, 429, { 'Retry-After': String(limited.retryAfter) });
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return json(request, { error: 'The import request is too large.' }, 413);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(request, { error: 'The import request is too large.' }, 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid');
    body = parsed as Record<string, unknown>;
  } catch {
    return json(request, { error: 'Send a valid JSON import request.' }, 400);
  }

  const sourceUrl = telegramUrl(body.sourceUrl);
  const name = clean(body.name, 120);
  const description = clean(body.description, 2_000);
  const category = clean(body.category, 60);
  const iconURL = getSafeExternalHttpsUrl(body.iconURL) ?? '';
  if (!sourceUrl || !name || !description || !category) {
    return json(request, { error: 'Enter a name, description, category, and a valid HTTPS Telegram link.' }, 400);
  }

  const upstream = getSafeExternalHttpsUrl(serviceUrl);
  if (!upstream) {
    return json(request, { error: 'Telegram import service is misconfigured.' }, 503);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(upstream, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
      },
      body: JSON.stringify({
        sourceUrl,
        name,
        description,
        category,
        iconURL,
        developerName: clean(body.developerName, 160),
        bundleIdentifier: clean(body.bundleIdentifier, 220),
      }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || typeof payload !== 'object') {
      return json(request, { error: 'Telegram import service could not process this link.' }, 502);
    }
    return json(request, payload);
  } catch {
    return json(request, { error: 'Telegram import service is unavailable.' }, 502);
  } finally {
    clearTimeout(timeout);
  }
}
