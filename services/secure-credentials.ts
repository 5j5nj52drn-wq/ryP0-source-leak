import { Platform } from 'react-native';
import Constants, { AppOwnership } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { assertAdminBuild, isAdminBuild } from './build-variant';

const GITHUB_TOKEN_KEY = 'ryp0.github_pat.v1';

export type CredentialProtection = 'face-id' | 'touch-id' | 'biometrics' | 'keychain' | 'unavailable';

export interface CredentialProtectionStatus {
  protection: CredentialProtection;
  requiresAuthentication: boolean;
  isExpoGo: boolean;
}

export async function getCredentialProtectionStatus(): Promise<CredentialProtectionStatus> {
  const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
  const secureStorageAvailable = Platform.OS !== 'web' && await SecureStore.isAvailableAsync();

  if (!secureStorageAvailable) {
    return { protection: 'unavailable', requiresAuthentication: false, isExpoGo };
  }

  if (Platform.OS !== 'ios' || isExpoGo) {
    return { protection: 'keychain', requiresAuthentication: false, isExpoGo };
  }

  const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  if (!hasHardware || !isEnrolled) {
    return { protection: 'keychain', requiresAuthentication: false, isExpoGo };
  }

  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return { protection: 'face-id', requiresAuthentication: true, isExpoGo };
  }

  if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return { protection: 'touch-id', requiresAuthentication: true, isExpoGo };
  }

  return { protection: 'biometrics', requiresAuthentication: true, isExpoGo };
}

async function secureStoreOptions(): Promise<SecureStore.SecureStoreOptions> {
  const { requiresAuthentication } = await getCredentialProtectionStatus();

  return {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    requireAuthentication: requiresAuthentication,
    authenticationPrompt: 'Unlock ryP0 Developer Mode',
  };
}

async function assertSecureStorageAvailable(): Promise<void> {
  if (Platform.OS === 'web' || !(await SecureStore.isAvailableAsync())) {
    throw new Error('Secure credential storage is unavailable on this device.');
  }
}

export async function getStoredGitHubToken(): Promise<string | null> {
  // A public build is a separate application identifier, but keep this guard
  // here as a second layer in case an old binary or a direct route reaches the
  // credential service.
  if (!isAdminBuild) return null;

  if (Platform.OS === 'web' || !(await SecureStore.isAvailableAsync())) {
    return null;
  }

  return SecureStore.getItemAsync(GITHUB_TOKEN_KEY, await secureStoreOptions());
}

export async function storeGitHubToken(token: string): Promise<void> {
  assertAdminBuild();
  await assertSecureStorageAvailable();
  await SecureStore.setItemAsync(GITHUB_TOKEN_KEY, token, await secureStoreOptions());
}

export async function deleteStoredGitHubToken(): Promise<void> {
  if (Platform.OS === 'web' || !(await SecureStore.isAvailableAsync())) {
    return;
  }

  await SecureStore.deleteItemAsync(GITHUB_TOKEN_KEY, await secureStoreOptions());
}
