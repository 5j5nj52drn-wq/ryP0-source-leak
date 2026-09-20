import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { useRepoStore } from '../../../store/useRepoStore';
import type { RepoApp } from '../../../types/repo';
import {
  extractRepositoryApps,
  importTelegramApp,
  ImportSourceError,
  normalizeHttpsUrl,
} from '../../../services/import-sources';
import { queuePrivateImport } from '../../../services/private-imports';
import { ACCENT_COLORS, useAppTheme } from '../../../theme/app-preferences';
import AppCategoryTabs from '../../../components/app-category-tabs';
import AppRequestForm from '../../../components/app-request-form';
import GitHubActionsCommitPicker from '../../../components/github-actions-commit-picker';
import GitHubReleaseChannelPicker from '../../../components/github-release-channel-picker';
import ImportDeliveryPicker from '../../../components/import-delivery-picker';
import ImportUpdatePolicyPicker, {
  ImportHistoryLimitPicker,
} from '../../../components/import-update-policy-picker';
import IpaUploader from '../../../components/ipa-uploader';
import RepositoryImportReview, {
  type StagedRepositoryApp,
} from '../../../components/repository-import-review';
import type { IpaUploadResult } from '../../../services/ipa-upload';
import {
  isGitHubRepositoryReference,
  listGitHubActionBuildCommits,
  type GitHubActionBuildCommit,
} from '../../../services/github-action-builds';
import type { ImportDeliveryMode, ImportHistoryLimit } from '../../../types/import-options';
import type { GitHubReleaseChannel } from '../../../types/github-release-channel';
import type { AppUpdatePolicy } from '../../../types/repo';

const WORKSPACE_TABS = [
  { id: 'add', label: 'Add Apps' },
  { id: 'requests', label: 'App Requests' },
  { id: 'manage', label: 'Manage Apps' },
] as const;

const IMPORT_METHODS = [
  { id: 'direct', label: 'Direct IPA' },
  { id: 'github', label: 'GitHub' },
  { id: 'repo', label: 'Repo' },
  { id: 'telegram', label: 'Telegram' },
] as const;

const CATEGORIES = [
  { id: 'Sideloading', label: 'Sideloading' },
  { id: 'Games', label: 'Games' },
  { id: 'Social', label: 'Social' },
  { id: 'EMU', label: 'EMU' },
  { id: 'Movies', label: 'Movies' },
  { id: 'Tools', label: 'Tools' },
] as const;

type WorkspaceTab = (typeof WORKSPACE_TABS)[number]['id'];
type ImportMethod = (typeof IMPORT_METHODS)[number]['id'];
type IconTarget = 'direct' | 'github' | 'telegram';
type Theme = ReturnType<typeof useAppTheme>;

function normalizedCategory(value?: string) {
  const match = CATEGORIES.find((category) => category.id.toLowerCase() === value?.trim().toLowerCase());
  return match?.id || 'Sideloading';
}

function prepareNewImport(app: RepoApp): RepoApp {
  return {
    ...app,
    // Importers may attach an upstream source for the private automation
    // service. Preserve its policy rather than silently turning a tracked app
    // into a static one while it is added to repo.json.
    updatePolicy: app.updatePolicy || 'static',
    status: { state: 'unknown' },
  };
}

function FormField({ label, theme, ...props }: TextInputProps & { label: string; theme: Theme }) {
  return (
    <View style={styles.field}>
      <Text selectable style={[styles.inputLabel, { color: theme.label }]}>{label}</Text>
      <TextInput
        {...props}
        style={[
          styles.input,
          props.multiline && styles.multilineInput,
          { backgroundColor: theme.input, borderColor: theme.separator, color: theme.label },
          props.style,
        ]}
        placeholderTextColor={theme.secondaryLabel}
      />
    </View>
  );
}

function SectionCard({
  title,
  detail,
  theme,
  children,
}: {
  title: string;
  detail?: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
      <Text selectable style={[styles.sectionHeading, { color: theme.label }]}>{title}</Text>
      {detail ? <Text selectable style={[styles.sectionSub, { color: theme.secondaryLabel }]}>{detail}</Text> : null}
      {children}
    </View>
  );
}

function IconPickerRow({
  value,
  target,
  theme,
  accent,
  onOpenGallery,
}: {
  value: string;
  target: IconTarget;
  theme: Theme;
  accent: string;
  onOpenGallery: (target: IconTarget) => void;
}) {
  return (
    <View style={styles.iconPickerRow}>
      {value ? (
        <Image source={{ uri: value }} style={styles.iconPreview} contentFit="cover" />
      ) : (
        <View style={[styles.iconPlaceholder, { backgroundColor: theme.input, borderColor: theme.separator }]}>
          <Text style={[styles.iconPlaceholderText, { color: theme.secondaryLabel }]}>Icon</Text>
        </View>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Choose icon from gallery"
        onPress={() => onOpenGallery(target)}
        style={[styles.galleryButton, { borderColor: accent }]}
      >
        <Text style={[styles.galleryButtonText, { color: accent }]}>Choose from Icon Gallery</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AddAppTabScreen() {
  const router = useRouter();
  const repo = useRepoStore((state) => state.repo);
  const fetchRepo = useRepoStore((state) => state.fetchRepo);
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const accentColor = useRepoStore((state) => state.accentColor);
  const pendingIconSelection = useRepoStore((state) => state.pendingIconSelection);
  const setPendingIconSelection = useRepoStore((state) => state.setPendingIconSelection);
  const theme = useAppTheme();
  const accent = ACCENT_COLORS[accentColor].value;

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('add');
  const [importMethod, setImportMethod] = useState<ImportMethod>('direct');
  const [isSaving, setIsSaving] = useState(false);
  const telegramSubmissionLock = useRef(false);
  const [iconTarget, setIconTarget] = useState<IconTarget | null>(null);

  const [directUrl, setDirectUrl] = useState('');
  const [directName, setDirectName] = useState('');
  const [directDescription, setDirectDescription] = useState('');
  const [directIconUrl, setDirectIconUrl] = useState('');
  const [directCategory, setDirectCategory] = useState('Sideloading');
  const [directDeliveryMode, setDirectDeliveryMode] = useState<ImportDeliveryMode>('direct-source');
  const [directHistoryLimit, setDirectHistoryLimit] = useState<ImportHistoryLimit>(3);
  const [directUploaderGeneration, setDirectUploaderGeneration] = useState(0);
  // A file selected on the device is first placed in the private source
  // repository.  Keep its opaque staging reference separate from a public
  // direct URL so it can never accidentally be published before validation.
  const [stagedIpa, setStagedIpa] = useState<IpaUploadResult | null>(null);

  const [githubRepository, setGithubRepository] = useState('');
  const [githubName, setGithubName] = useState('');
  const [githubDescription, setGithubDescription] = useState('');
  const [githubIconUrl, setGithubIconUrl] = useState('');
  const [githubCategory, setGithubCategory] = useState('Sideloading');
  const [githubDeliveryMode, setGithubDeliveryMode] = useState<ImportDeliveryMode>('direct-source');
  const [githubUpdatePolicy, setGithubUpdatePolicy] = useState<AppUpdatePolicy>('daily');
  const [githubHistoryLimit, setGithubHistoryLimit] = useState<ImportHistoryLimit>(3);
  const [githubReleaseChannel, setGithubReleaseChannel] = useState<GitHubReleaseChannel>('release');
  const [githubReleaseTag, setGithubReleaseTag] = useState('');
  const [githubActionsCommit, setGithubActionsCommit] = useState('');
  const [githubActionBuildCommits, setGithubActionBuildCommits] = useState<GitHubActionBuildCommit[]>([]);
  const [isLoadingGithubActions, setIsLoadingGithubActions] = useState(false);
  const [githubActionsLoadError, setGithubActionsLoadError] = useState('');

  const [repoUrl, setRepoUrl] = useState('');
  const [repoDeliveryMode, setRepoDeliveryMode] = useState<ImportDeliveryMode>('direct-source');
  const [repoUpdatePolicy, setRepoUpdatePolicy] = useState<AppUpdatePolicy>('daily');
  const [repoHistoryLimit, setRepoHistoryLimit] = useState<ImportHistoryLimit>(3);
  const [stagedApps, setStagedApps] = useState<StagedRepositoryApp[]>([]);
  const [isReviewSheetPresented, setIsReviewSheetPresented] = useState(false);

  const [telegramName, setTelegramName] = useState('');
  const [telegramDescription, setTelegramDescription] = useState('');
  const [telegramSourceUrl, setTelegramSourceUrl] = useState('');
  const [telegramDeveloper, setTelegramDeveloper] = useState('');
  const [telegramBundleId, setTelegramBundleId] = useState('');
  const [telegramIconUrl, setTelegramIconUrl] = useState('');
  const [telegramCategory, setTelegramCategory] = useState('Sideloading');

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of repo?.apps || []) {
      const category = normalizedCategory(app.category);
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return counts;
  }, [repo?.apps]);

  useEffect(() => {
    if (!pendingIconSelection || !iconTarget) return;
    if (iconTarget === 'direct') setDirectIconUrl(pendingIconSelection);
    if (iconTarget === 'github') setGithubIconUrl(pendingIconSelection);
    if (iconTarget === 'telegram') setTelegramIconUrl(pendingIconSelection);
    setPendingIconSelection(null);
    setIconTarget(null);
  }, [iconTarget, pendingIconSelection, setPendingIconSelection]);

  useEffect(() => {
    const repository = githubRepository.trim();
    if (githubReleaseChannel !== 'actions' || !isGitHubRepositoryReference(repository)) {
      setGithubActionBuildCommits([]);
      setGithubActionsLoadError('');
      setIsLoadingGithubActions(false);
      return;
    }

    let isCurrent = true;
    const timer = setTimeout(() => {
      setIsLoadingGithubActions(true);
      setGithubActionsLoadError('');
      void listGitHubActionBuildCommits(repository)
        .then((commits) => {
          if (!isCurrent) return;
          setGithubActionBuildCommits(commits);
          setGithubActionsCommit((current) => (current && !commits.some((commit) => commit.sha === current) ? '' : current));
        })
        .catch((error: unknown) => {
          if (!isCurrent) return;
          setGithubActionBuildCommits([]);
          setGithubActionsCommit('');
          setGithubActionsLoadError(error instanceof Error ? error.message : 'Could not load successful Actions builds.');
        })
        .finally(() => {
          if (isCurrent) setIsLoadingGithubActions(false);
        });
    }, 350);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [githubReleaseChannel, githubRepository]);

  const openIconGallery = useCallback((target: IconTarget) => {
    setIconTarget(target);
    router.push('/icons?mode=select');
  }, [router]);

  const handleIpaUploaded = useCallback((result: IpaUploadResult) => {
    setStagedIpa(result);
    setDirectUrl('');
    setDirectName((current) => {
      if (current.trim()) return current;
      return result.originalFilename
        .replace(/\.ipa$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
    });
  }, []);

  const handleDirectUrlChange = useCallback((value: string) => {
    setDirectUrl(value);
    // Typing a URL deliberately switches back to the direct-link flow. The
    // private staged asset remains inaccessible to users and is not queued.
    if (value.trim()) setStagedIpa(null);
  }, []);

  const handleAddDirect = useCallback(async () => {
    setIsSaving(true);
    try {
      const upload = stagedIpa;
      const downloadURL = upload ? '' : normalizeHttpsUrl(directUrl, 'IPA download URL');
      const filename = upload
        ? upload.originalFilename.replace(/\.ipa$/i, '')
        : downloadURL.split('/').pop()?.replace(/\.ipa(?:\?.*)?$/i, '') || 'Direct App';
      const name = directName.trim() || decodeURIComponent(filename).replace(/[-_]+/g, ' ');
      const description = directDescription.trim() || (
        upload
          ? 'Uploaded IPA pending private validation.'
          : 'Imported from a verified direct IPA link.'
      );
      await queuePrivateImport({
        method: upload ? 'upload-artifact' : 'direct-url',
        sourceUrl: downloadURL || undefined,
        appName: name,
        description,
        category: directCategory,
        iconUrl: directIconUrl || undefined,
        deliveryMode: upload ? 'mirror-release' : directDeliveryMode,
        updatePolicy: 'static',
        historyLimit: directHistoryLimit,
        ...(upload ? {
          uploadRepository: upload.uploadRepository,
          uploadReleaseTag: upload.stagingReleaseTag,
          uploadArtifactName: upload.filename,
        } : {}),
      });
      setDirectUrl('');
      setDirectName('');
      setDirectDescription('');
      setDirectIconUrl('');
      setDirectDeliveryMode('direct-source');
      setDirectHistoryLimit(3);
      setStagedIpa(null);
      setDirectUploaderGeneration((generation) => generation + 1);
      Alert.alert(
        upload ? 'Uploaded IPA Queued' : 'Direct IPA Queued',
        upload
          ? 'The private importer will inspect the local IPA, then keep its verified mirror copy before changing repo.json.'
          : 'The private importer will inspect metadata and preserve the original source link unless you explicitly chose a mirror copy.',
      );
    } catch (error: any) {
      Alert.alert('Could Not Queue IPA', error instanceof ImportSourceError ? error.message : error?.message || 'Check the IPA and icon URLs.');
    } finally {
      setIsSaving(false);
    }
  }, [directCategory, directDeliveryMode, directDescription, directHistoryLimit, directIconUrl, directName, directUrl, stagedIpa]);

  const handleAddGithub = useCallback(async () => {
    setIsSaving(true);
    try {
      if (githubReleaseChannel === 'tag' && !githubReleaseTag.trim()) {
        Alert.alert('Release Tag Required', 'Enter the exact GitHub tag you want to import.');
        return;
      }
      const importDispatch = await queuePrivateImport({
        method: 'github',
        sourceUrl: githubRepository,
        appName: githubName || undefined,
        description: githubDescription || undefined,
        iconUrl: githubIconUrl || undefined,
        category: githubCategory,
        deliveryMode: githubReleaseChannel === 'actions' ? 'mirror-release' : githubDeliveryMode,
        updatePolicy: githubUpdatePolicy,
        historyLimit: githubUpdatePolicy === 'daily' ? 1 : githubHistoryLimit,
        githubReleaseChannel,
        githubReleaseTag: githubReleaseChannel === 'tag' ? githubReleaseTag : undefined,
        githubActionsCommit: githubReleaseChannel === 'actions' ? githubActionsCommit : undefined,
      });
      setGithubRepository('');
      setGithubName('');
      setGithubDescription('');
      setGithubIconUrl('');
      setGithubDeliveryMode('direct-source');
      setGithubUpdatePolicy('daily');
      setGithubHistoryLimit(3);
      setGithubReleaseChannel('release');
      setGithubReleaseTag('');
      setGithubActionsCommit('');
      Alert.alert(
        'GitHub Import Started',
        githubReleaseChannel === 'actions'
          ? 'GitHub accepted the request and is validating the Actions artifact in the background. It has not been added to the catalog yet. Actions artifacts expire, so a verified mirror will be kept if validation succeeds.'
          : 'GitHub accepted the request and is validating the selected source in the background. It has not been added to the catalog yet. The original link will be kept unless you chose a mirror.',
        importDispatch.workflowUrl
          ? [
              {
                text: 'View Import Status',
                onPress: () => {
                  void Linking.openURL(importDispatch.workflowUrl!).catch(() => {
                    Alert.alert('Could Not Open Import Status', 'Open GitHub Actions in your browser to check this import.');
                  });
                },
              },
              { text: 'OK', style: 'cancel' },
            ]
          : undefined,
      );
    } catch (error: any) {
      Alert.alert('GitHub Import Failed', error?.message || 'Could not queue this GitHub source for validation.');
    } finally {
      setIsSaving(false);
    }
  }, [githubActionsCommit, githubCategory, githubDeliveryMode, githubDescription, githubHistoryLimit, githubIconUrl, githubName, githubReleaseChannel, githubReleaseTag, githubRepository, githubUpdatePolicy]);

  const handleExtractRepository = useCallback(async () => {
    setIsSaving(true);
    try {
      const apps = await extractRepositoryApps(repoUrl);
      const existingBundleIds = new Set((repo?.apps || []).map((app) => app.bundleIdentifier));
      const newApps = apps.filter((app) => !existingBundleIds.has(app.bundleIdentifier));
      if (!newApps.length) {
        Alert.alert('Nothing New to Import', 'Every valid app in this repository already exists in your repo.json.');
        return;
      }
      setStagedApps(newApps.map((app) => ({
        app: prepareNewImport(app),
        selected: true,
        category: normalizedCategory(app.category),
      })));
      setIsReviewSheetPresented(true);
    } catch (error: any) {
      Alert.alert('Repo Extraction Failed', error?.message || 'Could not safely read this repo.json.');
    } finally {
      setIsSaving(false);
    }
  }, [repo?.apps, repoUrl]);

  const toggleStaged = useCallback((bundleIdentifier: string) => {
    setStagedApps((items) => items.map((item) => (
      item.app.bundleIdentifier === bundleIdentifier ? { ...item, selected: !item.selected } : item
    )));
  }, []);

  const setStagedSelected = useCallback((bundleIdentifiers: readonly string[], selected: boolean) => {
    const identifiers = new Set(bundleIdentifiers);
    if (!identifiers.size) {
      if (!selected) {
        setStagedApps((items) => items.map((item) => item.selected ? { ...item, selected: false } : item));
      }
      return;
    }
    setStagedApps((items) => items.map((item) => (
      identifiers.has(item.app.bundleIdentifier) && item.selected !== selected
        ? { ...item, selected }
        : item
    )));
  }, []);

  const setStagedCategory = useCallback((bundleIdentifier: string, category: string) => {
    setStagedApps((items) => items.map((item) => (
      item.app.bundleIdentifier === bundleIdentifier ? { ...item, category } : item
    )));
  }, []);

  const handleMergeReviewedApps = useCallback(async () => {
    const selected = stagedApps
      .filter((item) => item.selected)
      .map(({ app, category }) => ({ app, category }));
    if (!selected.length) {
      Alert.alert('Select an App', 'Choose at least one app to queue for validation.');
      return;
    }
    setIsSaving(true);
    let queued = 0;
    try {
      const sourceUrl = normalizeHttpsUrl(repoUrl, 'Repository URL');
      for (const { app, category } of selected) {
        await queuePrivateImport({
          method: 'repository',
          sourceUrl,
          appName: app.name,
          description: app.localizedDescription || app.subtitle || undefined,
          iconUrl: app.iconURL || undefined,
          category,
          selector: app.bundleIdentifier,
          deliveryMode: repoDeliveryMode,
          updatePolicy: repoUpdatePolicy,
          historyLimit: repoUpdatePolicy === 'daily' ? 1 : repoHistoryLimit,
        });
        queued += 1;
      }
      setIsReviewSheetPresented(false);
      setStagedApps([]);
      setRepoUrl('');
      setRepoDeliveryMode('direct-source');
      setRepoUpdatePolicy('daily');
      setRepoHistoryLimit(3);
      Alert.alert(
        'Repository Imports Queued',
        `${queued} ${queued === 1 ? 'app is' : 'apps are'} being checked from the source repository before any catalog change is published. Original source links stay in place unless you chose a mirror.`,
      );
    } catch (error: any) {
      Alert.alert(
        'Repository Queue Paused',
        queued
          ? `${queued} ${queued === 1 ? 'app was' : 'apps were'} queued before this problem: ${error?.message || 'Could not queue the next app.'}`
          : error?.message || 'Could not queue this repository import.',
      );
    } finally {
      setIsSaving(false);
    }
  }, [repoDeliveryMode, repoHistoryLimit, repoUpdatePolicy, repoUrl, stagedApps]);

  const handleAddTelegram = useCallback(async () => {
    if (!telegramName.trim() || !telegramDescription.trim()) {
      Alert.alert('Complete the App', 'Name and description are required before Telegram can import the file.');
      return;
    }
    if (telegramSubmissionLock.current) return;
    telegramSubmissionLock.current = true;
    setIsSaving(true);
    try {
      const result = await importTelegramApp({
        name: telegramName,
        description: telegramDescription,
        category: telegramCategory,
        sourceUrl: telegramSourceUrl,
        iconURL: telegramIconUrl || undefined,
        developerName: telegramDeveloper || undefined,
        bundleIdentifier: telegramBundleId || undefined,
      });
      if (result.kind === 'queued') {
        setTelegramName('');
        setTelegramDescription('');
        setTelegramSourceUrl('');
        setTelegramDeveloper('');
        setTelegramBundleId('');
        setTelegramIconUrl('');
        Alert.alert(
          'Telegram Import Queued',
          'GitHub Actions is securely downloading the IPA, validating its metadata, uploading it to R2, and updating repo.json. This usually takes several minutes.',
          [
            { text: 'Done', style: 'cancel' },
            { text: 'View Progress', onPress: () => router.push('/workflows') },
          ],
        );
        return;
      }

      Alert.alert('Telegram Import', 'The private importer did not return a queue confirmation. Refresh Workflows before trying again.');
    } catch (error: any) {
      Alert.alert('Telegram Import Failed', error?.message || 'The Telegram import service could not process this message.');
    } finally {
      telegramSubmissionLock.current = false;
      setIsSaving(false);
    }
  }, [
    router,
    telegramBundleId,
    telegramCategory,
    telegramDescription,
    telegramDeveloper,
    telegramIconUrl,
    telegramName,
    telegramSourceUrl,
  ]);

  if (!isDeveloperMode) return <AppRequestForm />;

  const primaryButton = (label: string, onPress: () => void) => (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={isSaving}
      onPress={onPress}
      style={[styles.submitBtn, { backgroundColor: accent, opacity: isSaving ? 0.62 : 1 }]}
    >
      {isSaving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{label}</Text>}
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Add App', headerLargeTitle: true }} />
      {isDeveloperMode ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="tray.full" onPress={() => router.push('/requests')} />
        </Stack.Toolbar>
      ) : null}
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AppCategoryTabs
          categories={WORKSPACE_TABS}
          selectedCategory={workspaceTab}
          onSelectCategory={(tab) => {
            if (tab === 'requests') {
              router.push('/requests');
              return;
            }
            setWorkspaceTab(tab as WorkspaceTab);
          }}
          accentColor={accent}
        />

        {workspaceTab === 'add' ? (
          <>
            <View style={[styles.guideCard, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
              <Text selectable style={[styles.guideTitle, { color: theme.label }]}>Add a source, then validate privately</Text>
              <Text selectable style={[styles.guideText, { color: theme.secondaryLabel }]}>
                GitHub is best for repeat releases. Repo imports are reviewed before they merge. Telegram files are processed server-side so R2 and GitHub credentials stay private.
              </Text>
            </View>
            <AppCategoryTabs
              categories={IMPORT_METHODS}
              selectedCategory={importMethod}
              onSelectCategory={(method) => setImportMethod(method as ImportMethod)}
              accentColor={accent}
            />

            {importMethod === 'direct' ? (
              <SectionCard title="Direct IPA" detail="Paste a verified HTTPS .ipa link, or choose a local IPA. Uploaded files stay in private staging until the importer validates them; nothing is added to repo.json from this screen." theme={theme}>
                <IpaUploader
                  key={directUploaderGeneration}
                  accentColor={accent}
                  disabled={isSaving}
                  labelColor={theme.label}
                  secondaryLabelColor={theme.secondaryLabel}
                  onUploaded={handleIpaUploaded}
                />
                {stagedIpa ? (
                  <Text selectable style={[styles.stagedUploadDetail, { color: theme.secondaryLabel }]}>
                    {stagedIpa.originalFilename} is in private validation staging. Clear this by entering a direct URL instead.
                  </Text>
                ) : null}
                <FormField theme={theme} label={stagedIpa ? 'Or use a Direct IPA URL' : 'IPA Download URL'} placeholder="https://example.com/app.ipa" value={directUrl} onChangeText={handleDirectUrlChange} autoCapitalize="none" keyboardType="url" />
                <ImportDeliveryPicker
                  accentColor={accent}
                  allowedModes={stagedIpa ? ['mirror-release'] : ['direct-source', 'mirror-release']}
                  detail={stagedIpa
                    ? 'Local IPA uploads have no permanent upstream URL, so ryP0 keeps one verified mirror copy.'
                    : 'Use the original URL by default. Choose a mirror only when you explicitly want ryP0 to keep a copy.'}
                  disabled={isSaving || Boolean(stagedIpa)}
                  onChange={setDirectDeliveryMode}
                  value={stagedIpa ? 'mirror-release' : directDeliveryMode}
                />
                <ImportUpdatePolicyPicker
                  accentColor={accent}
                  detail="A one-off direct IPA link is manual. Add a new version yourself when its source changes."
                  disabled
                  onChange={() => undefined}
                  value="static"
                />
                <ImportHistoryLimitPicker
                  accentColor={accent}
                  disabled={isSaving}
                  onChange={setDirectHistoryLimit}
                  value={directHistoryLimit}
                />
                <FormField theme={theme} label="App Display Name (Optional)" placeholder="Automatically derived from the IPA filename" value={directName} onChangeText={setDirectName} />
                <FormField theme={theme} label="Description (Optional)" placeholder="What does this app do?" value={directDescription} onChangeText={setDirectDescription} multiline />
                <FormField theme={theme} label="Icon URL (Optional)" placeholder="https://…/icon.png" value={directIconUrl} onChangeText={setDirectIconUrl} autoCapitalize="none" keyboardType="url" />
                <IconPickerRow value={directIconUrl} target="direct" theme={theme} accent={accent} onOpenGallery={openIconGallery} />
                <Text selectable style={[styles.inputLabel, { color: theme.label }]}>Category</Text>
                <AppCategoryTabs categories={CATEGORIES} selectedCategory={directCategory} onSelectCategory={setDirectCategory} accentColor={accent} />
                {primaryButton('Add Direct IPA', () => void handleAddDirect())}
              </SectionCard>
            ) : null}

            {importMethod === 'github' ? (
              <SectionCard title="GitHub App Finder" detail="Choose the exact source: stable Release, Nightly, Alpha, a specific Tag, or the newest successful Actions build. The importer uses app metadata when available and never uses a developer profile photo as the app icon." theme={theme}>
                <FormField theme={theme} label="GitHub Repository" placeholder="owner/repository or https://github.com/owner/repository" value={githubRepository} onChangeText={setGithubRepository} autoCapitalize="none" />
                <Text selectable style={[styles.inputLabel, { color: theme.label }]}>Release source</Text>
                <Text selectable style={[styles.pickerHint, { color: theme.secondaryLabel }]}>Tap to choose Release, Nightly, Alpha, Tag, or a successful Workflow build.</Text>
                <GitHubReleaseChannelPicker
                  accentColor={accent}
                  disabled={isSaving}
                  value={githubReleaseChannel}
                  onChange={(nextChannel) => {
                    setGithubReleaseChannel(nextChannel);
                    if (nextChannel === 'actions') setGithubDeliveryMode('mirror-release');
                  }}
                />
                {githubReleaseChannel === 'tag' ? (
                  <FormField theme={theme} label="Release Tag" placeholder="v1.2.3" value={githubReleaseTag} onChangeText={setGithubReleaseTag} autoCapitalize="none" />
                ) : null}
                {githubReleaseChannel === 'actions' ? (
                  <>
                    <GitHubActionsCommitPicker
                      accentColor={accent}
                      commits={githubActionBuildCommits}
                      disabled={isSaving || !isGitHubRepositoryReference(githubRepository)}
                      isLoading={isLoadingGithubActions}
                      onChange={setGithubActionsCommit}
                      value={githubActionsCommit}
                    />
                    {githubActionsLoadError ? (
                      <Text selectable style={[styles.actionsLoadError, { color: theme.secondaryLabel }]}>{githubActionsLoadError}</Text>
                    ) : null}
                  </>
                ) : null}
                <ImportDeliveryPicker
                  accentColor={accent}
                  allowedModes={githubReleaseChannel === 'actions' ? ['mirror-release'] : ['direct-source', 'mirror-release']}
                  detail={githubReleaseChannel === 'actions'
                    ? 'GitHub Actions artifacts expire, so this source must be copied to a verified mirror.'
                    : 'Use the upstream download URL by default. Choose a mirror only when you explicitly want ryP0 to retain a copy.'}
                  disabled={isSaving || githubReleaseChannel === 'actions'}
                  onChange={setGithubDeliveryMode}
                  value={githubReleaseChannel === 'actions' ? 'mirror-release' : githubDeliveryMode}
                />
                <ImportUpdatePolicyPicker
                  accentColor={accent}
                  detail={githubUpdatePolicy === 'daily'
                    ? 'Checks the selected source each day and keeps only the newest version.'
                    : 'Stops automatic checks so you can manage a manual version history.'}
                  disabled={isSaving}
                  onChange={setGithubUpdatePolicy}
                  value={githubUpdatePolicy}
                />
                {githubUpdatePolicy === 'static' ? (
                  <ImportHistoryLimitPicker
                    accentColor={accent}
                    disabled={isSaving}
                    onChange={setGithubHistoryLimit}
                    value={githubHistoryLimit}
                  />
                ) : null}
                <FormField theme={theme} label="Rename App (Optional)" placeholder="Keep the repository name" value={githubName} onChangeText={setGithubName} />
                <FormField theme={theme} label="Description (Optional)" placeholder="Use the release or repository description" value={githubDescription} onChangeText={setGithubDescription} multiline />
                <FormField theme={theme} label="Icon URL (Optional)" placeholder="Automatically detected when empty" value={githubIconUrl} onChangeText={setGithubIconUrl} autoCapitalize="none" keyboardType="url" />
                <IconPickerRow value={githubIconUrl} target="github" theme={theme} accent={accent} onOpenGallery={openIconGallery} />
                <Text selectable style={[styles.inputLabel, { color: theme.label }]}>Category</Text>
                <AppCategoryTabs categories={CATEGORIES} selectedCategory={githubCategory} onSelectCategory={setGithubCategory} accentColor={accent} />
                {primaryButton('Find & Add App', () => void handleAddGithub())}
              </SectionCard>
            ) : null}

            {importMethod === 'repo' ? (
              <SectionCard title="Repository Extractor" detail="Extract a compatible repo.json, search every valid app, select the entries you want, and set a category for each one before anything is written." theme={theme}>
                <FormField theme={theme} label="Repository JSON URL" placeholder="https://community.example/repo.json" value={repoUrl} onChangeText={setRepoUrl} autoCapitalize="none" keyboardType="url" />
                <ImportDeliveryPicker
                  accentColor={accent}
                  detail="Use each selected app’s original source link by default. A mirror is an explicit per-import choice."
                  disabled={isSaving}
                  onChange={setRepoDeliveryMode}
                  value={repoDeliveryMode}
                />
                <ImportUpdatePolicyPicker
                  accentColor={accent}
                  detail={repoUpdatePolicy === 'daily'
                    ? 'Checks each selected source daily and keeps only its newest version.'
                    : 'Stops automatic checks so you can manage a manual version history.'}
                  disabled={isSaving}
                  onChange={setRepoUpdatePolicy}
                  value={repoUpdatePolicy}
                />
                {repoUpdatePolicy === 'static' ? (
                  <ImportHistoryLimitPicker
                    accentColor={accent}
                    disabled={isSaving}
                    onChange={setRepoHistoryLimit}
                    value={repoHistoryLimit}
                  />
                ) : null}
                {primaryButton('Extract & Review Apps', () => void handleExtractRepository())}
                {stagedApps.length ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={isSaving}
                    onPress={() => setIsReviewSheetPresented(true)}
                    style={[styles.secondaryButton, styles.reviewAgainButton, { borderColor: accent }]}
                  >
                    <Text style={[styles.secondaryButtonText, { color: accent }]}>Review {stagedApps.length} Extracted Apps</Text>
                  </TouchableOpacity>
                ) : null}
              </SectionCard>
            ) : null}

            {importMethod === 'telegram' ? (
              <SectionCard title="Telegram Importer" detail="Telegram downloads and Cloudflare R2 storage run only in your protected server worker. No Telegram session, R2 key, or GitHub credential is stored in the app." theme={theme}>
                <FormField theme={theme} label="App Name" placeholder="App name" value={telegramName} onChangeText={setTelegramName} />
                <FormField theme={theme} label="Description" placeholder="Describe the app for users" value={telegramDescription} onChangeText={setTelegramDescription} multiline />
                <FormField theme={theme} label="Telegram Message Link" placeholder="https://t.me/channel/123" value={telegramSourceUrl} onChangeText={setTelegramSourceUrl} autoCapitalize="none" keyboardType="url" />
                <FormField theme={theme} label="Bundle Identifier (Optional)" placeholder="Let the importer discover it" value={telegramBundleId} onChangeText={setTelegramBundleId} autoCapitalize="none" />
                <FormField theme={theme} label="Developer Name (Optional)" placeholder="Let the importer use source metadata" value={telegramDeveloper} onChangeText={setTelegramDeveloper} />
                <FormField theme={theme} label="Icon URL (Optional)" placeholder="https://…/icon.png" value={telegramIconUrl} onChangeText={setTelegramIconUrl} autoCapitalize="none" keyboardType="url" />
                <IconPickerRow value={telegramIconUrl} target="telegram" theme={theme} accent={accent} onOpenGallery={openIconGallery} />
                <ImportDeliveryPicker
                  accentColor={accent}
                  allowedModes={['r2']}
                  detail="Telegram IPA files are always validated, then stored in your protected R2 bucket."
                  disabled
                  onChange={() => undefined}
                  value="r2"
                />
                <ImportUpdatePolicyPicker
                  accentColor={accent}
                  detail="Telegram sources are checked daily and retain only the newest verified version."
                  disabled
                  onChange={() => undefined}
                  value="daily"
                />
                <Text selectable style={[styles.inputLabel, { color: theme.label }]}>Category</Text>
                <AppCategoryTabs categories={CATEGORIES} selectedCategory={telegramCategory} onSelectCategory={setTelegramCategory} accentColor={accent} />
                {primaryButton('Queue Telegram Import', () => void handleAddTelegram())}
              </SectionCard>
            ) : null}
          </>
        ) : null}

        {workspaceTab === 'manage' ? (
          <>
            <SectionCard title="Repository Overview" detail={String(repo?.apps.length || 0) + ' published ' + ((repo?.apps.length || 0) === 1 ? 'app.' : 'apps.') + ' Changes are committed through the authenticated GitHub Contents API.'} theme={theme}>
              <View style={styles.categorySummary}>
                {CATEGORIES.map((category) => (
                  <View key={category.id} style={[styles.categorySummaryRow, { borderColor: theme.separator }]}>
                    <Text selectable style={[styles.categorySummaryLabel, { color: theme.label }]}>{category.label}</Text>
                    <Text selectable style={[styles.categorySummaryValue, { color: theme.secondaryLabel }]}>{categoryCounts.get(category.id) || 0}</Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.navigate('/(tabs)/(apps)')} style={[styles.submitBtn, { backgroundColor: accent }]}>
                <Text style={styles.submitBtnText}>Open Apps Dashboard</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" onPress={() => void fetchRepo()} style={[styles.secondaryButton, { borderColor: accent }]}> 
                <Text style={[styles.secondaryButtonText, { color: accent }]}>Refresh Repository from GitHub</Text>
              </TouchableOpacity>
            </SectionCard>
            <SectionCard title="App Automations" detail="Manage the private updater attached to each published app. Run it, update its source, pause daily checks, or remove only its automation." theme={theme}>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/workflows')} style={[styles.submitBtn, { backgroundColor: accent }]}> 
                <Text style={styles.submitBtnText}>Manage App Automations</Text>
              </TouchableOpacity>
            </SectionCard>
          </>
        ) : null}
      </ScrollView>

      <RepositoryImportReview
        accentColor={accent}
        apps={stagedApps}
        categories={CATEGORIES}
        colors={theme}
        isPresented={isReviewSheetPresented}
        isSaving={isSaving}
        onDismiss={() => setIsReviewSheetPresented(false)}
        onMerge={() => void handleMergeReviewedApps()}
        onSetCategory={setStagedCategory}
        onSetSelected={setStagedSelected}
        onToggleSelected={toggleStaged}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  contentContainer: { paddingBottom: 132 },
  guideCard: { marginHorizontal: 16, marginBottom: 14, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, borderCurve: 'continuous' },
  guideTitle: { fontSize: 16, fontWeight: '700' },
  guideText: { marginTop: 5, fontSize: 13, lineHeight: 18 },
  formCard: { marginHorizontal: 16, marginBottom: 16, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, borderCurve: 'continuous' },
  sectionHeading: { fontSize: 18, fontWeight: '700' },
  sectionSub: { marginTop: 5, marginBottom: 16, fontSize: 13, lineHeight: 18 },
  stagedUploadDetail: { marginTop: -4, marginBottom: 12, fontSize: 12, lineHeight: 17 },
  field: { marginBottom: 14 },
  inputLabel: { marginBottom: 6, fontSize: 13, fontWeight: '600' },
  pickerHint: { fontSize: 12, lineHeight: 17, marginTop: -3, marginBottom: 4 },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  multilineInput: { minHeight: 78, textAlignVertical: 'top' },
  actionsLoadError: { fontSize: 13, lineHeight: 18, marginTop: -8, marginBottom: 14 },
  iconPickerRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 16 },
  iconPreview: { width: 48, height: 48, borderRadius: 11, borderCurve: 'continuous', backgroundColor: 'rgba(120, 120, 128, 0.16)' },
  iconPlaceholder: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: StyleSheet.hairlineWidth, borderCurve: 'continuous' },
  iconPlaceholderText: { fontSize: 10, fontWeight: '600' },
  galleryButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  galleryButtonText: { fontSize: 13, fontWeight: '600' },
  submitBtn: { minHeight: 46, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderRadius: 14 },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  secondaryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 12 },
  secondaryButtonText: { fontSize: 14, fontWeight: '700' },
  reviewAgainButton: { marginTop: 10 },
  categorySummary: { marginBottom: 12 },
  categorySummaryRow: { minHeight: 42, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  categorySummaryLabel: { fontSize: 15 },
  categorySummaryValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
