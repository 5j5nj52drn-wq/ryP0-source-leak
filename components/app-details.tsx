import React from 'react';
import { Alert, Linking, ScrollView } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Button, FieldGroup, Host, ListItem, Text } from '@expo/ui';
import { useRepoStore } from '../store/useRepoStore';
import type { RepoApp, RepoVersion } from '../types/repo';
import { installInLiveContainer } from '../services/livecontainer';
import { getAppStatus, getAppStatusKey, getAppUpdatePolicy } from '../services/app-status';

interface AppDetailsProps {
  app: RepoApp;
}

function formatFileSize(size?: number) {
  if (!size || size < 0) return 'Size unavailable';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const amount = size / Math.pow(1024, exponent);
  return `${amount.toFixed(amount >= 10 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export default function AppDetails({ app }: AppDetailsProps) {
  const router = useRouter();
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const installApp = useRepoStore((state) => state.installApp);
  const runtimeStatus = useRepoStore((state) => state.runtimeAppStatuses[getAppStatusKey(app)]);
  const latestVersion = app.versions[0];
  const appStatus = getAppStatus(app, runtimeStatus ?? app.status);

  const handleInstall = async () => {
    try {
      await installApp(app);
    } catch (error: any) {
      Alert.alert('Installation', error?.message || 'Unable to open the download link.');
    }
  };

  const handleVersionDownload = async (version: RepoVersion) => {
    try {
      await Linking.openURL(version.downloadURL);
    } catch (error: any) {
      Alert.alert('Download', error?.message || 'Unable to open this version download link.');
    }
  };

  const handleInstallInLiveContainer = async () => {
    if (!latestVersion) return;
    try {
      await installInLiveContainer(latestVersion);
    } catch (error: any) {
      Alert.alert('LiveContainer', error?.message || 'Unable to hand this IPA to LiveContainer.');
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: app.name, headerLargeTitle: false, headerLargeTitleEnabled: false }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1 }}>
        <Host style={{ minHeight: 700 + app.versions.length * 72, width: '100%' }}>
          <FieldGroup>
            <FieldGroup.Section title="App Information">
              <ListItem trailing={<Text>{getAppUpdatePolicy(app) === 'daily' ? 'Daily Update' : 'Static'}</Text>}><Text>App Type</Text></ListItem>
              <ListItem supportingText={appStatus.message || appStatus.detail} trailing={<Text>{appStatus.label}</Text>}><Text>Status</Text></ListItem>
              <ListItem supportingText={app.developerName || 'Unknown developer'}>
                <Text>{app.name}</Text>
              </ListItem>
              <ListItem trailing={<Text>{app.category || 'Uncategorized'}</Text>}>
                <Text>Category</Text>
              </ListItem>
              <ListItem supportingText={app.bundleIdentifier}>
                <Text>Bundle Identifier</Text>
              </ListItem>
              {latestVersion ? (
                <ListItem trailing={<Text>{latestVersion.version}</Text>}>
                  <Text>Latest Version</Text>
                </ListItem>
              ) : null}
            </FieldGroup.Section>

            <FieldGroup.Section title="Description">
              <ListItem supportingText={app.localizedDescription || app.subtitle || 'No description has been provided for this app.'}>
                <Text>{app.subtitle || 'About this app'}</Text>
              </ListItem>
            </FieldGroup.Section>

            <FieldGroup.Section title={`Versions (${app.versions.length})`}>
              {app.versions.map((version, index) => (
                <ListItem
                  key={`${version.version}-${version.date}-${index}`}
                  onPress={() => void handleVersionDownload(version)}
                  supportingText={[version.date, formatFileSize(version.size), version.minOSVersion ? `iOS ${version.minOSVersion}+` : null].filter(Boolean).join(' · ')}
                  trailing={<Text>Download</Text>}
                >
                  <Text>{version.version}</Text>
                </ListItem>
              ))}
            </FieldGroup.Section>

            <FieldGroup.Section>
              <Button onPress={handleInstall}><Text>Install Latest Version</Text></Button>
              {latestVersion ? <Button onPress={() => void handleInstallInLiveContainer()}><Text>Install in LiveContainer</Text></Button> : null}
              {isDeveloperMode ? (
                <Button onPress={() => router.push({ pathname: '/edit', params: { bundleIdentifier: app.bundleIdentifier } })} variant="text">
                  <Text>Edit App</Text>
                </Button>
              ) : null}
            </FieldGroup.Section>
          </FieldGroup>
        </Host>
      </ScrollView>
    </>
  );
}
