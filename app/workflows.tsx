import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { Button, FieldGroup, Host, ListItem, Text, TextInput, useNativeState } from '@expo/ui';
import { useRepoStore } from '../store/useRepoStore';
import {
  deleteGitHubWorkflowFile,
  dispatchGitHubWorkflow,
  getLatestGitHubWorkflowRun,
  listGitHubWorkflows,
  readGitHubWorkflowFile,
  saveGitHubWorkflowFile,
  setGitHubWorkflowEnabled,
  type GitHubWorkflow,
  type GitHubWorkflowFile,
  type GitHubWorkflowRun,
} from '../services/github-workflows';

function humanDate(value?: string): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function workflowStatusLabel(workflow: GitHubWorkflow): string {
  return workflow.state === 'active'
    ? 'Active'
    : workflow.state === 'disabled_manually'
      ? 'Disabled'
      : workflow.state.replace(/^disabled_/, 'Disabled · ');
}

function runStatusLabel(run: GitHubWorkflowRun | null): string {
  if (!run) return 'No runs found';
  if (run.status !== 'completed') return `${run.status[0]?.toUpperCase() ?? ''}${run.status.slice(1)}`;
  if (!run.conclusion) return 'Completed';
  return run.conclusion[0].toUpperCase() + run.conclusion.slice(1).replace(/_/g, ' ');
}

function isTelegramWorkflow(workflow: GitHubWorkflow | null): boolean {
  if (!workflow) return false;
  return /telegram|cloudflare|\br2\b/i.test(`${workflow.name} ${workflow.path}`);
}

function matchingAppName(workflow: GitHubWorkflow, apps: { name: string; bundleIdentifier: string }[]): string | null {
  const source = `${workflow.name} ${workflow.path}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = apps.find((app) => {
    const name = app.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const bundle = app.bundleIdentifier.toLowerCase().replace(/[^a-z0-9]/g, '');
    return name.length > 2 && (source.includes(name) || name.includes(source) || source.includes(bundle));
  });
  return match?.name ?? null;
}

function workflowPurpose(workflow: GitHubWorkflow, apps: { name: string; bundleIdentifier: string }[]): string {
  if (isTelegramWorkflow(workflow)) return 'Telegram → Cloudflare R2 importer';
  if (/update all/i.test(workflow.name)) return 'Repository-wide updater';
  if (/pages-build/i.test(workflow.name)) return 'GitHub Pages deployment';
  if (/builder/i.test(workflow.name)) return 'Repository app builder';
  const appName = matchingAppName(workflow, apps);
  return appName ? `App updater · ${appName}` : 'Repository automation';
}

export default function WorkflowManagerScreen() {
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const repositoryApps = useRepoStore((state) => state.repo?.apps ?? []);
  const [workflows, setWorkflows] = useState<GitHubWorkflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<GitHubWorkflow | null>(null);
  const [workflowFile, setWorkflowFile] = useState<GitHubWorkflowFile | null>(null);
  const [latestRun, setLatestRun] = useState<GitHubWorkflowRun | null>(null);
  const editorText = useNativeState('');
  const telegramChannel = useNativeState('');
  const telegramAppName = useNativeState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const selectionRequestRef = useRef(0);

  const loadWorkflows = useCallback(async (showFailure = false) => {
    if (!isDeveloperMode) {
      setWorkflows([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      setWorkflows(await listGitHubWorkflows());
    } catch (error: any) {
      if (showFailure) {
        Alert.alert('Could Not Load Workflows', error?.message || 'Check your GitHub credentials and connection.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isDeveloperMode]);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const chooseWorkflow = useCallback(async (workflow: GitHubWorkflow) => {
    const requestId = selectionRequestRef.current + 1;
    selectionRequestRef.current = requestId;
    setSelectedWorkflow(workflow);
    setWorkflowFile(null);
    setLatestRun(null);
    editorText.value = '';
    setIsLoadingWorkflow(true);

    try {
      const file = await readGitHubWorkflowFile(workflow.path);
      if (selectionRequestRef.current !== requestId) return;
      setWorkflowFile(file);
      editorText.value = file.content;

      const run = await getLatestGitHubWorkflowRun(workflow.id);
      if (selectionRequestRef.current !== requestId) return;
      setLatestRun(run);
    } catch (error: any) {
      if (selectionRequestRef.current === requestId) {
        Alert.alert('Could Not Open Workflow', error?.message || 'GitHub could not return this workflow.');
      }
    } finally {
      if (selectionRequestRef.current === requestId) setIsLoadingWorkflow(false);
    }
  }, []);

  const reloadSelectedWorkflow = useCallback(async () => {
    if (!selectedWorkflow) return;
    await chooseWorkflow(selectedWorkflow);
  }, [chooseWorkflow, selectedWorkflow]);

  const saveWorkflow = useCallback(async () => {
    if (!selectedWorkflow || !workflowFile) return;

    setIsMutating(true);
    try {
      const saved = await saveGitHubWorkflowFile(
        selectedWorkflow.path,
        editorText.value,
        workflowFile.sha,
        `Update ${selectedWorkflow.name} workflow via ryP0 CMS`,
      );
      setWorkflowFile((current) => current ? { ...current, sha: saved.contentSha, content: editorText.value } : current);
      Alert.alert('Workflow Saved', `${selectedWorkflow.name} was committed to GitHub.`);
      void loadWorkflows();
    } catch (error: any) {
      Alert.alert('Could Not Save Workflow', error?.message || 'Reload the workflow before trying again.');
    } finally {
      setIsMutating(false);
    }
  }, [editorText, loadWorkflows, selectedWorkflow, workflowFile]);

  const runWorkflow = useCallback(async () => {
    if (!selectedWorkflow) return;
    const usesTelegram = isTelegramWorkflow(selectedWorkflow);
    const channel = telegramChannel.value.trim().replace(/^@/, '');
    const appName = telegramAppName.value.trim();

    if (usesTelegram && (!channel || !appName)) {
      Alert.alert('Telegram Inputs Required', 'Enter the source channel and the exact app name already in repo.json.');
      return;
    }

    setIsMutating(true);
    try {
      await dispatchGitHubWorkflow(
        selectedWorkflow.id,
        usesTelegram ? { channel_username: channel, app_name: appName } : undefined,
      );
      Alert.alert('Workflow Started', `${selectedWorkflow.name} is queued on GitHub Actions.`);
      void reloadSelectedWorkflow();
    } catch (error: any) {
      Alert.alert('Could Not Start Workflow', error?.message || 'GitHub could not queue this workflow.');
    } finally {
      setIsMutating(false);
    }
  }, [reloadSelectedWorkflow, selectedWorkflow, telegramAppName, telegramChannel]);

  const toggleWorkflow = useCallback(() => {
    if (!selectedWorkflow) return;
    const enabling = selectedWorkflow.state !== 'active';
    const action = enabling ? 'Enable' : 'Disable';
    Alert.alert(
      `${action} ${selectedWorkflow.name}?`,
      enabling
        ? 'This lets GitHub Actions run this workflow again.'
        : 'This stops GitHub Actions from running this workflow until you enable it again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: enabling ? 'default' : 'destructive',
          onPress: () => {
            void (async () => {
              setIsMutating(true);
              try {
                await setGitHubWorkflowEnabled(selectedWorkflow.id, enabling);
                setSelectedWorkflow((current) => current ? { ...current, state: enabling ? 'active' : 'disabled_manually' } : current);
                setWorkflows((current) => current.map((workflow) => (
                  workflow.id === selectedWorkflow.id
                    ? { ...workflow, state: enabling ? 'active' : 'disabled_manually' }
                    : workflow
                )));
              } catch (error: any) {
                Alert.alert(`Could Not ${action} Workflow`, error?.message || 'GitHub could not change this workflow.');
              } finally {
                setIsMutating(false);
              }
            })();
          },
        },
      ],
    );
  }, [selectedWorkflow]);

  const deleteWorkflow = useCallback(() => {
    if (!selectedWorkflow || !workflowFile) return;
    Alert.alert(
      `Delete ${selectedWorkflow.name}?`,
      'This removes the workflow file from GitHub. Existing workflow runs remain in GitHub history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Workflow',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setIsMutating(true);
              try {
                await deleteGitHubWorkflowFile(
                  selectedWorkflow.path,
                  workflowFile.sha,
                  `Delete ${selectedWorkflow.name} workflow via ryP0 CMS`,
                );
                setWorkflows((current) => current.filter((workflow) => workflow.id !== selectedWorkflow.id));
                setSelectedWorkflow(null);
                setWorkflowFile(null);
                setLatestRun(null);
                editorText.value = '';
                Alert.alert('Workflow Deleted', `${selectedWorkflow.name} was removed from GitHub.`);
              } catch (error: any) {
                Alert.alert('Could Not Delete Workflow', error?.message || 'Reload the workflow before trying again.');
              } finally {
                setIsMutating(false);
              }
            })();
          },
        },
      ],
    );
  }, [editorText, selectedWorkflow, workflowFile]);

  const changeEditorText = useCallback((value: string) => {
    'worklet';
    editorText.value = value;
  }, [editorText]);

  const changeTelegramChannel = useCallback((value: string) => {
    'worklet';
    telegramChannel.value = value;
  }, [telegramChannel]);

  const changeTelegramAppName = useCallback((value: string) => {
    'worklet';
    telegramAppName.value = value;
  }, [telegramAppName]);

  const selectedPurpose = useMemo(
    () => selectedWorkflow ? workflowPurpose(selectedWorkflow, repositoryApps) : null,
    [repositoryApps, selectedWorkflow],
  );
  const hasUnsafePositionSelector = useMemo(
    () => Boolean(workflowFile && /\.apps\s*\[\s*\d+\s*\]/.test(workflowFile.content)),
    [workflowFile],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Workflow Manager', headerLargeTitle: true }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="arrow.clockwise" onPress={() => void loadWorkflows(true)} />
      </Stack.Toolbar>
      <Host style={{ flex: 1, width: '100%' }}>
        {!isDeveloperMode ? (
          <FieldGroup>
            <FieldGroup.Section title="Developer Access Required">
              <ListItem supportingText="Sign in with a verified GitHub token in Settings to manage repository automations.">
                <Text>Workflow Manager Is Locked</Text>
              </ListItem>
            </FieldGroup.Section>
          </FieldGroup>
        ) : (
          <FieldGroup>
            <FieldGroup.Section title="Automations">
              <ListItem supportingText="Workflows update apps, import Telegram uploads, and publish repository changes. Select one to inspect, run, edit, disable, or delete it.">
                <Text>{isLoading ? 'Loading GitHub Actions…' : `${workflows.length} GitHub workflow${workflows.length === 1 ? '' : 's'}`}</Text>
              </ListItem>
              <Button onPress={() => void loadWorkflows(true)} disabled={isLoading || isMutating} variant="outlined">
                <Text>{isLoading ? 'Refreshing…' : 'Refresh Workflows'}</Text>
              </Button>
            </FieldGroup.Section>

            <FieldGroup.Section title="Repository Workflows">
              {workflows.map((workflow) => (
                <ListItem
                  key={workflow.id}
                  onPress={() => void chooseWorkflow(workflow)}
                  supportingText={workflowPurpose(workflow, repositoryApps)}
                  trailing={<Text>{workflowStatusLabel(workflow)}</Text>}
                >
                  <Text>{workflow.name}</Text>
                </ListItem>
              ))}
              {!isLoading && !workflows.length ? (
                <ListItem supportingText="GitHub did not return any workflows. Check the token’s Actions and Contents permissions.">
                  <Text>No Workflows Found</Text>
                </ListItem>
              ) : null}
            </FieldGroup.Section>

            {selectedWorkflow ? (
              <>
                <FieldGroup.Section title={selectedWorkflow.name}>
                  <ListItem supportingText={selectedPurpose ?? undefined} trailing={<Text>{workflowStatusLabel(selectedWorkflow)}</Text>}>
                    <Text>Automation</Text>
                  </ListItem>
                  <ListItem supportingText={selectedWorkflow.path} trailing={<Text>{isLoadingWorkflow ? 'Loading…' : 'Loaded'}</Text>}>
                    <Text>Workflow File</Text>
                  </ListItem>
                  <ListItem
                    onPress={() => latestRun?.htmlUrl ? void Linking.openURL(latestRun.htmlUrl) : undefined}
                    supportingText={latestRun ? `${humanDate(latestRun.updatedAt || latestRun.createdAt)} · ${latestRun.event || 'manual run'}` : 'This workflow has not run yet.'}
                    trailing={<Text>{runStatusLabel(latestRun)}</Text>}
                  >
                    <Text>Latest Run</Text>
                  </ListItem>
                  {hasUnsafePositionSelector ? (
                    <ListItem
                      supportingText="This can update the wrong app after the repository is reordered. Replace apps[index] with a bundleIdentifier selector before saving."
                      trailing={<Text>Fix needed</Text>}
                    >
                      <Text>Unsafe repo.json Target</Text>
                    </ListItem>
                  ) : null}
                  <Button onPress={() => void runWorkflow()} disabled={isMutating || isLoadingWorkflow || selectedWorkflow.state !== 'active'}>
                    <Text>{isMutating ? 'Working…' : isTelegramWorkflow(selectedWorkflow) ? 'Run Telegram Import' : 'Run Workflow'}</Text>
                  </Button>
                  {selectedWorkflow.htmlUrl ? (
                    <Button onPress={() => void Linking.openURL(selectedWorkflow.htmlUrl!)} disabled={isMutating} variant="outlined">
                      <Text>Open in GitHub</Text>
                    </Button>
                  ) : null}
                </FieldGroup.Section>

                {isTelegramWorkflow(selectedWorkflow) ? (
                  <FieldGroup.Section title="Telegram Import Inputs">
                    <TextInput
                      value={telegramChannel}
                      onChangeText={changeTelegramChannel}
                      placeholder="Channel username, without @"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextInput
                      value={telegramAppName}
                      onChangeText={changeTelegramAppName}
                      placeholder="Exact app name in repo.json"
                    />
                    <FieldGroup.SectionFooter>
                      <Text>The workflow fetches the newest IPA from that channel, places it in Cloudflare R2, and updates the matching repository app.</Text>
                    </FieldGroup.SectionFooter>
                  </FieldGroup.Section>
                ) : null}

                <FieldGroup.Section title="Workflow Source">
                  {workflowFile ? (
                    <TextInput
                      value={editorText}
                      onChangeText={changeEditorText}
                      multiline
                      numberOfLines={18}
                      autoCapitalize="none"
                      autoCorrect={false}
                      textAlign="left"
                      placeholder="Workflow YAML"
                    />
                  ) : (
                    <ListItem supportingText="The file source is loading from GitHub.">
                      <Text>Loading Workflow Source</Text>
                    </ListItem>
                  )}
                  <Button onPress={() => void saveWorkflow()} disabled={!workflowFile || isMutating || isLoadingWorkflow}>
                    <Text>{isMutating ? 'Saving…' : 'Save Workflow Source'}</Text>
                  </Button>
                  <Button onPress={() => void reloadSelectedWorkflow()} disabled={isMutating || isLoadingWorkflow} variant="outlined">
                    <Text>Discard Local Changes & Reload</Text>
                  </Button>
                  <FieldGroup.SectionFooter>
                    <Text>Saving uses the current GitHub file SHA, so it cannot overwrite a workflow another person changed first.</Text>
                  </FieldGroup.SectionFooter>
                </FieldGroup.Section>

                <FieldGroup.Section title="Workflow Controls">
                  <Button onPress={toggleWorkflow} disabled={isMutating || isLoadingWorkflow} variant="outlined">
                    <Text>{selectedWorkflow.state === 'active' ? 'Disable Workflow' : 'Enable Workflow'}</Text>
                  </Button>
                  <Button onPress={deleteWorkflow} disabled={!workflowFile || isMutating || isLoadingWorkflow} variant="text">
                    <Text>Delete Workflow</Text>
                  </Button>
                  <FieldGroup.SectionFooter>
                    <Text>Disable pauses runs but retains the source. Delete permanently removes this workflow file after confirmation.</Text>
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
