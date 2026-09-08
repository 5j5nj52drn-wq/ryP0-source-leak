import { Linking, Platform } from 'react-native';
import type { RepoVersion } from '../types/repo';
import { requireSafeExternalHttpsUrl } from './safe-url';

export class LiveContainerInstallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveContainerInstallError';
  }
}

function secureDownloadUrl(value: string): string {
  try {
    return requireSafeExternalHttpsUrl(value, 'This version does not have a safe HTTPS IPA link');
  } catch {
    throw new LiveContainerInstallError('This version does not have a safe HTTPS IPA link.');
  }
}

/**
 * LiveContainer receives the IPA URL through its documented install deep link.
 * The nested URL must stay percent-encoded or query strings in the IPA link
 * would be interpreted as parameters for the LiveContainer link instead.
 */
export function liveContainerInstallUrl(version: Pick<RepoVersion, 'downloadURL'>): string {
  return `livecontainer://install?url=${encodeURIComponent(secureDownloadUrl(version.downloadURL))}`;
}

export async function installInLiveContainer(version: Pick<RepoVersion, 'downloadURL'>): Promise<void> {
  if (Platform.OS !== 'ios') {
    throw new LiveContainerInstallError('Installing through LiveContainer is available on iPhone and iPad only.');
  }

  const deepLink = liveContainerInstallUrl(version);
  const isInstalled = await Linking.canOpenURL('livecontainer://install');
  if (!isInstalled) {
    throw new LiveContainerInstallError('LiveContainer is not installed. Install LiveContainer first, then try again.');
  }

  await Linking.openURL(deepLink);
}
