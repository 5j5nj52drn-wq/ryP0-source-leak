/**
 * Normalizes a URL that is safe to open outside the app.
 *
 * Repository metadata is public and app requests are user supplied, so neither
 * should be allowed to invoke an arbitrary URL scheme (for example `file:`,
 * `javascript:`, or another app's custom deep link). Keep custom schemes in
 * their dedicated integrations, such as LiveContainer, and use this helper
 * for URLs that leave ryP0 to reach a web host.
 */
export const MAX_EXTERNAL_HTTPS_URL_LENGTH = 8_192;

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return false;
  const octets = parts.map(Number);
  if (octets.some((octet) => octet > 255)) return false;
  const [first, second] = octets;

  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168);
}

function isLocalOrPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost'
    || host.endsWith('.localhost')
    || host === '::1'
    || host === '::'
    || /^(?:fc|fd)[0-9a-f]{2}:/i.test(host)
    || /^fe[89ab][0-9a-f]:/i.test(host)) {
    return true;
  }

  return isPrivateIpv4(host);
}

/**
 * Returns a canonical HTTPS URL for external navigation, or null when the
 * value is not suitable for an external link. Credentials and loopback hosts
 * are rejected so a public repo cannot smuggle an authenticated or local URL
 * into an install/open action.
 */
export function getSafeExternalHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.length > MAX_EXTERNAL_HTTPS_URL_LENGTH
    || /[\u0000-\u001F\u007F]/.test(trimmed)
  ) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    if (
      url.protocol !== 'https:'
      || !url.hostname
      || Boolean(url.username)
      || Boolean(url.password)
      || isLocalOrPrivateHost(url.hostname)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function isSafeExternalHttpsUrl(value: unknown): value is string {
  return getSafeExternalHttpsUrl(value) !== null;
}

export function requireSafeExternalHttpsUrl(value: unknown, label = 'URL'): string {
  const normalized = getSafeExternalHttpsUrl(value);
  if (!normalized) {
    throw new Error(`${label} must be a safe HTTPS URL.`);
  }
  return normalized;
}
