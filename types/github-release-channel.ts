export const GITHUB_RELEASE_CHANNELS = [
  'release',
  'nightly',
  'alpha',
  'tag',
  'actions',
] as const;

export type GitHubReleaseChannel = (typeof GITHUB_RELEASE_CHANNELS)[number];

export const GITHUB_RELEASE_CHANNEL_OPTIONS: ReadonlyArray<{
  id: GitHubReleaseChannel;
  label: string;
}> = [
  { id: 'release', label: 'Release' },
  { id: 'nightly', label: 'Nightly' },
  { id: 'alpha', label: 'Alpha' },
  { id: 'tag', label: 'Tag' },
  { id: 'actions', label: 'Latest Actions Build' },
];

export function isGitHubReleaseChannel(value: unknown): value is GitHubReleaseChannel {
  return typeof value === 'string'
    && (GITHUB_RELEASE_CHANNELS as readonly string[]).includes(value);
}
