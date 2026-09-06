import React, { useCallback, useEffect } from 'react';
import { Alert, Linking } from 'react-native';
import { Button, FieldGroup, Host, ListItem, Picker, Text, TextInput, useNativeState } from '@expo/ui';
import { Image } from 'expo-image';

import { useRepoStore } from '../../../store/useRepoStore';
import { ADMIN_GITHUB_LOGIN, isAdminGitHubLogin } from '../../../services/github-api';
import {
  ACCENT_COLORS,
  AccentColor,
  AppearancePreference,
} from '../../../theme/app-preferences';

const DISCORD_URL = 'https://discord.gg/6r2Eax4c5j';
const YOUTUBE_URL = 'https://www.youtube.com/@ry0_Offical';
const OWNER_GITHUB_URL = `https://github.com/${ADMIN_GITHUB_LOGIN}`;

type SettingsSymbolName =
  | 'arrow.up.right'
  | 'checkmark.shield.fill'
  | 'circle.lefthalf.filled'
  | 'faceid'
  | 'key.fill'
  | 'message.fill'
  | 'paintpalette.fill'
  | 'person.crop.circle.fill'
  | 'play.rectangle.fill'
  | 'shield.fill';

function SettingsSymbol({
  name,
  color,
  size = 21,
}: {
  name: SettingsSymbolName;
  color: string;
  size?: number;
}) {
  return (
    <Image
      source={`sf:${name}`}
      contentFit="contain"
      tintColor={color}
      style={{ width: size, height: size }}
    />
  );
}

function DisclosureSymbol({ color }: { color: string }) {
  return <SettingsSymbol name="arrow.up.right" color={color} size={17} />;
}

export default function Settings() {
  const {
    hasGitHubCredential,
    githubLogin,
    setGithubToken,
    isDeveloperMode,
    isAuthenticating,
    authError,
    credentialProtection,
    initializeStore,
    appearancePreference,
    accentColor,
    setAppearancePreference,
    setAccentColor,
  } = useRepoStore();
  const token = useNativeState('');

  useEffect(() => {
    void initializeStore();
  }, [initializeStore]);

  useEffect(() => {
    // A stored PAT should never be copied back into a visible form field.
    if (!hasGitHubCredential) {
      token.value = '';
    }
  }, [hasGitHubCredential, token]);

  const handleChangeText = useCallback((value: string) => {
    'worklet';
    token.value = value;
  }, [token]);

  const handleSave = async () => {
    const submittedToken = token.value.trim();
    if (!submittedToken) {
      Alert.alert('Token Required', 'Enter a GitHub token to validate or replace Developer Mode credentials.');
      return;
    }

    try {
      const account = await setGithubToken(submittedToken);
      token.value = '';
      Alert.alert(
        'Developer Mode Enabled',
        `GitHub verified @${account?.login ?? 'your account'} has write access to ry0-x/ry0-x.github.io.`,
      );
    } catch (error: any) {
      Alert.alert('Authentication Failed', error?.message || 'GitHub could not verify this token.');
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out of Developer Mode?',
      'This removes the stored developer credential from this device and returns the app to read-only mode.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            void setGithubToken('').then(() => {
              token.value = '';
              Alert.alert('Read-Only Mode', 'Developer credentials have been removed from this device.');
            }).catch((error: any) => {
              Alert.alert('Sign Out Failed', error?.message || 'Unable to remove the developer credential.');
            });
          },
        },
      ],
    );
  };

  const handleOpenLink = async (url: string, title: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to Open Link', `${title} could not be opened on this device.`);
    }
  };

  const credentialProtectionText = credentialProtection?.protection === 'face-id'
    ? 'Face ID protects this device’s saved developer token.'
    : credentialProtection?.protection === 'touch-id'
      ? 'Touch ID protects this device’s saved developer token.'
      : credentialProtection?.isExpoGo
        ? 'Stored in the iOS Keychain. Face ID activates in a development or production build.'
        : 'Stored in the device Keychain. Set up Face ID or Touch ID to add biometric protection.';
  const accentValue = ACCENT_COLORS[accentColor].value;
  // Show the single supported owner account up front without implying that a
  // credential is already connected. A verified login replaces this label.
  const accountLabel = `@${githubLogin ?? ADMIN_GITHUB_LOGIN}`;
  // GitHub logins are case-insensitive. Keep this display guard aligned with
  // token validation so an owner account is never shown as merely generic
  // repository access due to a capitalization difference in the API response.
  const isOwnerAccount = isAdminGitHubLogin(githubLogin);
  const accountDetail = isAuthenticating
    ? 'Checking GitHub repository access…'
    : isDeveloperMode
      ? isOwnerAccount
        ? `${ADMIN_GITHUB_LOGIN} · verified repository access`
        : 'Verified repository write access'
      : `Not connected · add a ${ADMIN_GITHUB_LOGIN} token to enable edits`;
  const profileUrl = githubLogin ? `https://github.com/${githubLogin}` : OWNER_GITHUB_URL;

  return (
    <Host
      style={{ flex: 1, width: '100%' }}
      colorScheme={appearancePreference === 'system' ? undefined : appearancePreference}
      seedColor={accentValue}
    >
      <FieldGroup>
        <FieldGroup.Section title="Preferences">
          <ListItem
            leading={<SettingsSymbol name="circle.lefthalf.filled" color={accentValue} />}
            trailing={
              <Picker<AppearancePreference>
                selectedValue={appearancePreference}
                onValueChange={(value) => void setAppearancePreference(value)}
                appearance="menu"
              >
                <Picker.Item label="System" value="system" />
                <Picker.Item label="Light" value="light" />
                <Picker.Item label="Dark" value="dark" />
              </Picker>
            }
          >
            <Text>Appearance</Text>
          </ListItem>
          <ListItem
            leading={<SettingsSymbol name="paintpalette.fill" color={accentValue} />}
            trailing={
              <Picker<AccentColor>
                selectedValue={accentColor}
                onValueChange={(value) => void setAccentColor(value)}
                appearance="menu"
              >
                {Object.entries(ACCENT_COLORS).map(([value, option]) => (
                  <Picker.Item key={value} label={option.label} value={value as AccentColor} />
                ))}
              </Picker>
            }
          >
            <Text>Accent Color</Text>
          </ListItem>
        </FieldGroup.Section>

        <FieldGroup.Section title="Developer Access">
          <ListItem
            leading={<SettingsSymbol name={isDeveloperMode ? 'checkmark.shield.fill' : 'shield.fill'} color={isDeveloperMode ? '#34C759' : accentValue} />}
            supportingText={isDeveloperMode ? 'Editing and workflow controls are available on this device.' : 'Browse, search, and submit requests without repository write access.'}
          >
            <Text>{isDeveloperMode ? 'Developer Mode is enabled' : 'Consumer Mode (read-only)'}</Text>
          </ListItem>
          <TextInput
            value={token}
            onChangeText={handleChangeText}
            placeholder={hasGitHubCredential ? 'Enter a replacement GitHub token' : 'Enter Token'}
            secureTextEntry
          />
          <Button onPress={handleSave} disabled={isAuthenticating}>
            <Text>{isAuthenticating ? 'Verifying GitHub…' : isDeveloperMode ? 'Validate & Replace Token' : 'Validate & Enable Developer Mode'}</Text>
          </Button>
          {isDeveloperMode ? (
            <Button onPress={handleSignOut} disabled={isAuthenticating}>
              <Text>Sign Out of Developer Mode</Text>
            </Button>
          ) : null}
          <FieldGroup.SectionFooter>
            <Text>Contents read/write is enough for repo.json. Workflow controls also require Actions/workflows write access (or a classic token with the workflow scope).</Text>
            {authError ? <Text>{authError}</Text> : null}
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>

        <FieldGroup.Section title="Security">
          <ListItem
            leading={<SettingsSymbol name="faceid" color={accentValue} />}
            supportingText={credentialProtectionText}
          >
            <Text>Credential Protection</Text>
          </ListItem>
          <ListItem
            leading={<SettingsSymbol name="key.fill" color={accentValue} />}
            supportingText="The token stays in the Keychain and is never written to repo.json, AsyncStorage, or the app bundle."
          >
            <Text>Local-only credential</Text>
          </ListItem>
        </FieldGroup.Section>

        <FieldGroup.Section title="About ryP0">
          <ListItem
            onPress={() => void handleOpenLink(OWNER_GITHUB_URL, 'GitHub')}
            leading={<SettingsSymbol name="person.crop.circle.fill" color={accentValue} />}
            trailing={<DisclosureSymbol color={accentValue} />}
            supportingText="Creator and ryP0 repository owner"
          >
            <Text>{ADMIN_GITHUB_LOGIN}</Text>
          </ListItem>
          <ListItem
            leading={<SettingsSymbol name="shield.fill" color={accentValue} />}
            supportingText="A native iOS companion for the ry0-x app repository"
          >
            <Text>ryP0</Text>
          </ListItem>
        </FieldGroup.Section>

        <FieldGroup.Section title="Community">
          <ListItem
            onPress={() => void handleOpenLink(DISCORD_URL, 'Discord')}
            leading={<SettingsSymbol name="message.fill" color={accentValue} />}
            trailing={<DisclosureSymbol color={accentValue} />}
            supportingText="Join the ryP0 Discord server"
          >
            <Text>Discord</Text>
          </ListItem>
          <ListItem
            onPress={() => void handleOpenLink(YOUTUBE_URL, 'YouTube')}
            leading={<SettingsSymbol name="play.rectangle.fill" color={accentValue} />}
            trailing={<DisclosureSymbol color={accentValue} />}
            supportingText="Watch updates from ry0 Official"
          >
            <Text>YouTube</Text>
          </ListItem>
        </FieldGroup.Section>
      </FieldGroup>
    </Host>
  );
}
