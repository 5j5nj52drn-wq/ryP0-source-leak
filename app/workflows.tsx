import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { Stack } from 'expo-router';
import { Button, FieldGroup, Host, ListItem, Text, TextInput, useNativeState } from '@expo/ui';
import {
  fetchAppAutomationSnapshot,
  queueAppAutomationMutation,
  runAppAutomation,
  type AppAutomationConfiguration,
  type AppAutomationMutation,
  type AppAutomationSnapshot,
  type AppAutomationSource,
} from '../services/app-automations';
import { useRepoStore } from '../store/useRepoStore';

function sourceLabel(source: AppAutomationSource): string {
  switch (source.kind) {
    case 'github_release':
      return 'GitHub Releases';
    case 'github_actions':
      return 'GitHub Actions';
    case 'archive':
      return 'GitHub Actions Archive';
    case 'gitlab_release':
      return 'GitLab Release';
    case 'forgejo_release':
      return 'Forgejo Release';
    case 'repo_json':
      return 'External repo.json';
    case 'telegram':
      return 'Telegram';
  }
}

function sourcePrimary(source: AppAutomationSource): string {
  switch (source.kind) {
    case 'github_release':
    case 'github_actions':
      return source.repository;
    case 'archive':
    case 'repo_json':
    case 'telegram':
      return source.url;
    case 'gitlab_release':
    case 'forgejo_release':
      return source.apiURL;
  }
}

function sourceSelector(source: AppAutomationSource): string {
  switch (source.kind) {
    case 'github_release':
    case 'gitlab_release':
    case 'forgejo_release':
      return source.assetPattern;
    case 'github_actions':
      return source.artifactPattern;
    case 'repo_json':
      return source.bundleIdentifier ?? source.appNamePattern ?? '';
    case 'archive':
    case 'telegram':
      return '';
  }
}

function primaryPlaceholder(source: AppAutomationSource): string {
  return source.kind === 'github_release' || source.kind === 'github_actions'
    ? 'owner/repository'
    : source.kind === 'gitlab_release'
      ? 'GitLab releases API URL'
      : source.kind === 'forgejo_release'
        ? 'Forgejo releases API URL'
      : source.kind === 'repo_json'
        ? 'Public repo.json URL'
        : source.kind === 'telegram'
          ? 'Public Telegram channel URL'
          : 'Public ZIP archive URL';
}

function selectorPlaceholder(source: AppAutomationSource): string {
  return source.kind === 'repo_json'
    ? source.bundleIdentifier
      ? 'Exact source bundle identifier'
      : 'Exact app-name pattern'
    : source.kind === 'github_actions'
      ? 'IPA artifact pattern'
      : 'IPA asset pattern';
}

function replaceSourceValues(
  source: AppAutomationSource,
  primary: string,
  selector: string,
): AppAutomationSource {
  switch (source.kind) {
    case 'github_release':
      return { ...source, repository: primary, assetPattern: selector };
    case 'github_actions':
      return { ...source, repository: primary, artifactPattern: selector };
    case 'archive':
      return { ...source, url: primary };
    case 'gitlab_release':
    case 'forgejo_release':
      return { ...source, apiURL: primary, assetPattern: selector };
    case 'repo_json':
      return source.bundleIdentifier
        ? { ...source, url: primary, bundleIdentifier: selector }
        : { ...source, url: primary, appNamePattern: selector };
    case 'telegram':
      return { ...source, url: primary };
  }
}

function userMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AppAutomationManagerScreen() {
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const repositoryApps = useRepoStore((state) => state.repo?.apps ?? []);
  const [snapshot, setSnapshot] = useState<AppAutomationSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);
  const displayName = useNativeState('');
  const bundleIdentifier = useNativeState('');
  const sourceBundleIdentifier = useNativeState('');
  const bundlePattern = useNativeState('');
  const primaryValue = useNativeState('');
  const selectorValue = useNativeState('');

  const selected = useMemo(
    () => snapshot?.apps.find((app) => app.id === selectedId) ?? null,
    [selectedId, snapshot?.apps],
  );
  const publicApp = useMemo(
    () => selected
      ? repositoryApps.find((app) => (
        app.automation?.configId === selected.id ||
        app.bundleIdentifier === selected.bundleIdentifier
      )) ?? null
      : null,
    [repositoryApps, selected],
  );

  const selectApp = useCallback((app: AppAutomationConfiguration) => {
    setSelectedId(app.id);
    displayName.value = app.displayName;
    bundleIdentifier.value = app.bundleIdentifier;
    sourceBundleIdentifier.value = app.sourceBundleIdentifier;
    bundlePattern.value = app.bundleIdentifierPattern ?? '';
    primaryValue.value = sourcePrimary(app.source);
    selectorValue.value = sourceSelector(app.source);
  }, [bundleIdentifier, bundlePattern, displayName, primaryValue, selectorValue, sourceBundleIdentifier]);

  const load = useCallback(async (showFailure = false) => {
    if (!isDeveloperMode) {
      setSnapshot(null);
      setSelectedId(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const next = await fetchAppAutomationSnapshot();
      setSnapshot(next);
      setSelectedId((current) => {
        if (current && next.apps.some((app) => app.id === current)) return current;
        const first = next.apps[0] ?? null;
        if (first) {
          displayName.value = first.displayName;
          bundleIdentifier.value = first.bundleIdentifier;
          sourceBundleIdentifier.value = first.sourceBundleIdentifier;
          bundlePattern.value = first.bundleIdentifierPattern ?? '';
          primaryValue.value = sourcePrimary(first.source);
          selectorValue.value = sourceSelector(first.source);
        }
        return first?.id ?? null;
      });
    } catch (error) {
      if (showFailure) {
        Alert.alert('Could Not Load Automations', userMessage(error, 'Check your GitHub access and connection.'));
      }
    } finally {
      setIsLoading(false);
    }
  }, [bundleIdentifier, bundlePattern, displayName, isDeveloperMode, primaryValue, selectorValue, sourceBundleIdentifier]);

  useEffect(() => {
    void load();
  }, [load]);

  const runNow = useCallback(async () => {
    if (!selected) return;
    setIsWorking(true);
    try {
      await runAppAutomation(selected.id);
      Alert.alert('Updater Started', `${selected.displayName} is queued in private GitHub automation.`);
    } catch (error) {
      Alert.alert('Could Not Start Updater', userMessage(error, 'GitHub could not queue this updater.'));
    } finally {
      setIsWorking(false);
    }
  }, [selected]);

  const queueMutation = useCallback(async (
    action: AppAutomationMutation,
    replacement?: AppAutomationConfiguration,
  ) => {
    if (!snapshot || !selected) return;
    setIsWorking(true);
    try {
      await queueAppAutomationMutation(snapshot, action, selected.id, replacement);
      Alert.alert(
        'Change Queued',
        'The private management workflow will validate and commit this change. Reload after the GitHub run finishes.',
      );
    } catch (error) {
      Alert.alert('Could Not Change Automation', userMessage(error, 'GitHub could not queue this change.'));
    } finally {
      setIsWorking(false);
    }
  }, [selected, snapshot]);

  const save = useCallback(() => {
    if (!selected) return;
    const replacement: AppAutomationConfiguration = {
      ...selected,
      displayName: displayName.value.trim(),
      bundleIdentifier: bundleIdentifier.value.trim(),
      sourceBundleIdentifier: sourceBundleIdentifier.value.trim(),
      ...(bundlePattern.value.trim()
        ? { bundleIdentifierPattern: bundlePattern.value.trim() }
        : { bundleIdentifierPattern: undefined }),
      source: replaceSourceValues(
        selected.source,
        primaryValue.value.trim(),
        selectorValue.value.trim(),
      ),
    };
    void queueMutation('update', replacement);
  }, [bundleIdentifier, bundlePattern, displayName, primaryValue, queueMutation, selected, selectorValue, sourceBundleIdentifier]);

  const toggleEnabled = useCallback(() => {
    if (!selected) return;
    const enabled = selected.enabled !== false;
    const action: AppAutomationMutation = enabled ? 'disable' : 'enable';
    Alert.alert(
      `${enabled ? 'Disable' : 'Enable'} ${selected.displayName}?`,
      enabled
        ? 'Daily updates will skip this app. Its public catalog entry and IPA history stay untouched.'
        : 'This app will return to the daily update queue.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: enabled ? 'Disable' : 'Enable',
          style: enabled ? 'destructive' : 'default',
          onPress: () => void queueMutation(action),
        },
      ],
    );
  }, [queueMutation, selected]);

  const remove = useCallback(() => {
    if (!selected) return;
    Alert.alert(
      `Remove ${selected.displayName} automation?`,
      'This removes only its private updater and manual launcher. It does not delete the app, repo.json data, or IPA releases.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove Automation', style: 'destructive', onPress: () => void queueMutation('delete') },
      ],
    );
  }, [queueMutation, selected]);

  const changeDisplayName = useCallback((value: string) => {
    'worklet';
    displayName.value = value;
  }, [displayName]);
  const changeBundleIdentifier = useCallback((value: string) => {
    'worklet';
    bundleIdentifier.value = value;
  }, [bundleIdentifier]);
  const changeSourceBundleIdentifier = useCallback((value: string) => {
    'worklet';
    sourceBundleIdentifier.value = value;
  }, [sourceBundleIdentifier]);
  const changeBundlePattern = useCallback((value: string) => {
    'worklet';
    bundlePattern.value = value;
  }, [bundlePattern]);
  const changePrimary = useCallback((value: string) => {
    'worklet';
    primaryValue.value = value;
  }, [primaryValue]);
  const changeSelector = useCallback((value: string) => {
    'worklet';
    selectorValue.value = value;
  }, [selectorValue]);

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Apps', headerLargeTitle: true }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="arrow.clockwise" onPress={() => void load(true)} />
      </Stack.Toolbar>
      <Host style={{ flex: 1, width: '100%' }}>
        {!isDeveloperMode ? (
          <FieldGroup>
            <FieldGroup.Section title="Developer Access Required">
              <ListItem supportingText="Unlock the verified Sami-Wali GitHub account in Settings to manage private app automation.">
                <Text>App Automation Is Locked</Text>
              </ListItem>
            </FieldGroup.Section>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <FieldGroup.Section title="Private Automation">
              <ListItem supportingText="Each app has a visible manual launcher, while every launcher uses the same validated updater engine.">
                <Text>{isLoading ? 'Loading automations…' : `${snapshot?.apps.length ?? 0} managed app updaters`}</Text>
              </ListItem>
              <Button onPress={() => void load(true)} disabled={isLoading || isWorking} variant="outlined">
                <Text>{isLoading ? 'Refreshing…' : 'Reload from GitHub'}</Text>
              </Button>
            </FieldGroup.Section>

            <FieldGroup.Section title="Apps">
              {snapshot?.apps.map((app) => (
                <ListItem
                  key={app.id}
                  onPress={() => selectApp(app)}
                  supportingText={`${sourceLabel(app.source)} · ${app.bundleIdentifier}`}
                  trailing={<Text>{app.enabled === false ? 'Paused' : app.id === selectedId ? 'Selected' : 'Daily'}</Text>}
                >
                  <Text>{app.displayName}</Text>
                </ListItem>
              ))}
              {!isLoading && !snapshot?.apps.length ? (
                <ListItem supportingText="Check that your GitHub token can read Sami-Wali/ryP0-automation.">
                  <Text>No App Automations Found</Text>
                </ListItem>
              ) : null}
            </FieldGroup.Section>

            {selected ? (
              <>
                <FieldGroup.Section title={selected.displayName}>
                  <ListItem
                    supportingText={publicApp?.versions[0]
                      ? `Public version ${publicApp.versions[0].version}`
                      : 'No matching public catalog app was found.'}
                    trailing={<Text>{selected.enabled === false ? 'Paused' : 'Active'}</Text>}
                  >
                    <Text>{sourceLabel(selected.source)}</Text>
                  </ListItem>
                  <ListItem supportingText={publicApp?.status?.message ?? 'No updater status message yet.'}>
                    <Text>Latest Status</Text>
                  </ListItem>
                  <Button onPress={() => void runNow()} disabled={isWorking || selected.enabled === false}>
                    <Text>{isWorking ? 'Working…' : 'Run This App Updater'}</Text>
                  </Button>
                  <FieldGroup.SectionFooter>
                    <Text>The run validates the IPA bundle ID and embedded version before it can change repo.json.</Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>

                <FieldGroup.Section title="Updater Configuration">
                  <TextInput value={displayName} onChangeText={changeDisplayName} placeholder="Display name" />
                  <TextInput
                    value={bundleIdentifier}
                    onChangeText={changeBundleIdentifier}
                    placeholder="Catalog bundle identifier"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    value={sourceBundleIdentifier}
                    onChangeText={changeSourceBundleIdentifier}
                    placeholder="Source IPA bundle identifier"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    value={bundlePattern}
                    onChangeText={changeBundlePattern}
                    placeholder="Allowed bundle pattern (optional)"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TextInput
                    value={primaryValue}
                    onChangeText={changePrimary}
                    placeholder={primaryPlaceholder(selected.source)}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {selected.source.kind === 'github_release' ||
                  selected.source.kind === 'gitlab_release' ||
                  selected.source.kind === 'forgejo_release' ||
                  selected.source.kind === 'repo_json' ? (
                    <TextInput
                      value={selectorValue}
                      onChangeText={changeSelector}
                      placeholder={selectorPlaceholder(selected.source)}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  ) : null}
                  <Button onPress={save} disabled={isWorking}>
                    <Text>Validate & Save Automation</Text>
                  </Button>
                  <FieldGroup.SectionFooter>
                    <Text>Saving queues a private GitHub workflow. It cannot overwrite a newer configuration loaded by another session.</Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>

                <FieldGroup.Section title="Controls">
                  <Button onPress={toggleEnabled} disabled={isWorking} variant="outlined">
                    <Text>{selected.enabled === false ? 'Enable Daily Updates' : 'Pause Daily Updates'}</Text>
                  </Button>
                  <Button onPress={remove} disabled={isWorking} variant="text">
                    <Text>Remove App Automation</Text>
                  </Button>
                  <FieldGroup.SectionFooter>
                    <Text>Pause is reversible. Remove affects only automation; it never deletes the public app or release history.</Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>
              </>
            ) : null}
          </FieldGroup>
        )}
      </Host>
    </>
  );
}
