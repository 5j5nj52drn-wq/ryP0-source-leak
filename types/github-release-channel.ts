export const GITHUB_RELEASE_CHANNELS = [
  'release',
  'beta',
  'nightly',
  'alpha',
  'prerelease',
  'tag',
  'actions',
] as const;

export type GitHubReleaseChannel = (typeof GITHUB_RELEASE_CHANNELS)[number];

export const GITHUB_RELEASE_CHANNEL_OPTIONS: ReadonlyArray<{
  id: GitHubReleaseChannel;
  label: string;
}> = [
  { id: 'release', label: 'Release' },
  { id: 'beta', label: 'Beta' },
  { id: 'nightly', label: 'Nightly' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'prerelease', label: 'Other Pre-release' },
  { id: 'tag', label: 'Tag' },
  { id: 'actions', label: 'Latest Actions Build' },
];

/** Channels which identify a real GitHub Release rather than a manual tag or Actions build. */
export const GITHUB_RELEASE_DISCOVERY_CHANNELS = [
  'release',
  'beta',
  'nightly',
  'alpha',
  'prerelease',
] as const;

export type GitHubReleaseDiscoveryChannel = (typeof GITHUB_RELEASE_DISCOVERY_CHANNELS)[number];

export const GITHUB_RELEASE_DISCOVERY_CHANNEL_LABELS: Record<GitHubReleaseDiscoveryChannel, string> = {
  release: 'Release',
  beta: 'Beta',
  nightly: 'Nightly',
  alpha: 'Alpha',
  prerelease: 'Other Pre-release',
};

export function isGitHubReleaseChannel(value: unknown): value is GitHubReleaseChannel {
  return typeof value === 'string'
    && (GITHUB_RELEASE_CHANNELS as readonly string[]).includes(value);
}
