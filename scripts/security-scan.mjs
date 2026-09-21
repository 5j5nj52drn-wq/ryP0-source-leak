#!/usr/bin/env node

/**
 * A deliberately local, dependency-free guard against accidentally shipping a
 * credential. It reports only a file, line, and finding category — never the
 * matching value — so running it cannot echo a secret into a terminal log.
 *
 * This complements GitHub and Cloudflare secret storage. It is not a secret
 * manager, and it intentionally does not run in a paid macOS build workflow.
 */
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = process.cwd();
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const BINARY_EXTENSIONS = new Set([
  '.7z', '.a', '.aar', '.apk', '.app', '.bin', '.cer', '.der', '.dmg', '.gif',
  '.heic', '.ico', '.ipa', '.jar', '.jpeg', '.jpg', '.keystore', '.mov', '.mp3',
  '.mp4', '.p12', '.p8', '.pdf', '.png', '.ttf', '.webp', '.woff', '.woff2', '.zip',
]);
const EXCLUDED_DIRECTORIES = new Set([
  '.expo', '.git', 'android', 'dist', 'ios', 'node_modules', 'web-build',
]);

function extensionOf(file) {
  const lastDot = file.lastIndexOf('.');
  return lastDot === -1 ? '' : file.slice(lastDot).toLowerCase();
}

function isWithinRepository(file) {
  const absolute = resolve(root, file);
  return absolute === root || absolute.startsWith(`${root}/`);
}

function trackedAndUntrackedFiles() {
  const output = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
  });

  const files = new Set(output.split('\n').filter(Boolean));

  // Ignored dotenv files are purposefully checked too. Their values remain
  // local, but an EXPO_PUBLIC_ credential would still be bundled by Expo.
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.startsWith('.env')) files.add(entry.name);
  }

  return [...files].sort();
}

function shouldInspect(file) {
  if (file === 'scripts/security-scan.mjs') return false;
  if (!isWithinRepository(file) || BINARY_EXTENSIONS.has(extensionOf(file))) return false;

  const pieces = file.split('/');
  if (pieces.some((piece) => EXCLUDED_DIRECTORIES.has(piece))) return false;

  const absolute = resolve(root, file);
  try {
    const metadata = lstatSync(absolute);
    return metadata.isFile() && !metadata.isSymbolicLink() && statSync(absolute).size <= MAX_TEXT_BYTES;
  } catch {
    return false;
  }
}

function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function collectMatches(text, expression, category) {
  const findings = [];
  expression.lastIndex = 0;
  let match;
  while ((match = expression.exec(text)) !== null) {
    findings.push({ line: lineAt(text, match.index), category });
    if (match[0].length === 0) expression.lastIndex += 1;
  }
  return findings;
}

function inspectFile(file) {
  const absolute = resolve(root, file);
  const bytes = readFileSync(absolute);
  if (bytes.includes(0)) return [];

  const text = bytes.toString('utf8');
  const findings = [
    ...collectMatches(text, /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, 'GitHub token'),
    ...collectMatches(text, /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/g, 'private key'),
    ...collectMatches(text, /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, 'AWS access key'),
    ...collectMatches(text, /\bcf[a-zA-Z0-9_-]{36,}\b/g, 'Cloudflare token'),
    ...collectMatches(
      text,
      /(?:^|\n)\s*(?:export\s+)?EXPO_PUBLIC_[A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|TELEGRAM|R2|CLOUDFLARE|AWS)[A-Z0-9_]*\s*=\s*[^\s#][^\n]*/gim,
      'sensitive EXPO_PUBLIC_ value',
    ),
    ...collectMatches(
      text,
      /process\.env(?:\[['"]|\.)(EXPO_PUBLIC_[A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|CREDENTIAL|TELEGRAM|R2|CLOUDFLARE|AWS)[A-Z0-9_]*)/gi,
      'sensitive EXPO_PUBLIC_ reference',
    ),
    ...collectMatches(
      text,
      /https?:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/gi,
      'credential in URL',
    ),
  ];

  const unique = new Map();
  for (const finding of findings) unique.set(`${finding.line}:${finding.category}`, finding);
  return [...unique.values()];
}

const findings = [];
for (const file of trackedAndUntrackedFiles()) {
  if (!shouldInspect(file)) continue;
  for (const finding of inspectFile(file)) {
    findings.push({ file: relative(root, resolve(root, file)), ...finding });
  }
}

if (findings.length === 0) {
  console.log('Security scan passed: no likely credential values found.');
  process.exit(0);
}

console.error('Security scan found potential credential exposure(s):');
for (const finding of findings) {
  console.error(`- ${finding.file}:${finding.line} (${finding.category})`);
}
console.error('Values are intentionally not printed. Remove the value from source, rotate it if real, and keep it in protected environment secrets instead.');
process.exit(1);
