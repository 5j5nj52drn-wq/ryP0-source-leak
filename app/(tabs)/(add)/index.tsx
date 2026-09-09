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
import type { AppRequestRecord } from '../../../types/app-request';
import { fetchAppRequests } from '../../../services/app-requests';
import { getSafeExternalHttpsUrl } from '../../../services/safe-url';
import {
  DEFAULT_ICON_URL,
  extractRepositoryApps,
  importLatestGitHubRelease,
  importTelegramApp,
  ImportSourceError,
  normalizeHttpsUrl,
} from '../../../services/import-sources';
import { ACCENT_COLORS, useAppTheme } from '../../../theme/app-preferences';
import AppCategoryTabs from '../../../components/app-category-tabs';
import AppRequestForm from '../../../components/app-request-form';
import IpaUploader from '../../../components/ipa-uploader';
import RepositoryImportReview, {
  type StagedRepositoryApp,
} from '../../../components/repository-import-review';
import type { IpaUploadResult } from '../../../services/ipa-upload';

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

function makeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 80) || 'app';
}

// Direct files do not reliably expose a bundle identifier until a server-side
// IPA inspection step exists. Make the temporary repository identifier stable
// per URL so two differently hosted apps with the same display name cannot
// collide, while re-adding the exact same URL still selects the same record.
function directLinkIdentifier(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

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

function recommendationFor(request: AppRequestRecord): { method: ImportMethod; label: string; detail: string } {
  const source = request.sourceUrl.toLowerCase();
  if (request.method === 'direct-ipa' || source.includes('.ipa')) {
    return { method: 'direct', label: 'Direct IPA', detail: 'This request includes a direct IPA link.' };
  }
  if (request.method === 'message-link' || source.includes('t.me/') || source.includes('telegram.me/')) {
    return { method: 'telegram', label: 'Telegram', detail: 'Process the message link through the protected Telegram/R2 importer.' };
  }
  if (source.endsWith('.json') || source.includes('repo.json')) {
    return { method: 'repo', label: 'Repo', detail: 'Review this repo, select its apps, and set a category for each before merging.' };
  }
  return { method: 'github', label: 'GitHub', detail: 'Fetch its latest GitHub release and inspect the IPA before committing.' };
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
  const reorderApps = useRepoStore((state) => state.reorderApps);
  const commitChanges = useRepoStore((state) => state.commitChanges);
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
  const [directUploadSize, setDirectUploadSize] = useState(0);
  const [directUploaderGeneration, setDirectUploaderGeneration] = useState(0);

  const [githubRepository, setGithubRepository] = useState('');
  const [githubName, setGithubName] = useState('');
  const [githubDescription, setGithubDescription] = useState('');
  const [githubIconUrl, setGithubIconUrl] = useState('');
  const [githubCategory, setGithubCategory] = useState('Sideloading');

  const [repoUrl, setRepoUrl] = useState('');
  const [stagedApps, setStagedApps] = useState<StagedRepositoryApp[]>([]);
  const [isReviewSheetPresented, setIsReviewSheetPresented] = useState(false);

  const [telegramName, setTelegramName] = useState('');
  const [telegramDescription, setTelegramDescription] = useState('');
  const [telegramSourceUrl, setTelegramSourceUrl] = useState('');
  const [telegramDeveloper, setTelegramDeveloper] = useState('');
  const [telegramBundleId, setTelegramBundleId] = useState('');
  const [telegramIconUrl, setTelegramIconUrl] = useState('');
  const [telegramCategory, setTelegramCategory] = useState('Sideloading');

  const [requests, setRequests] = useState<AppRequestRecord[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);

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

  const openIconGallery = useCallback((target: IconTarget) => {
    setIconTarget(target);
    router.push('/icons?mode=select');
  }, [router]);

  const persistApps = useCallback(async (apps: RepoApp[], title: string, message: string) => {
    if (!repo) {
      Alert.alert('Repository Unavailable', 'Refresh the Apps page before adding an app.');
      return false;
    }
    setIsSaving(true);
    reorderApps(apps);
    try {
      await commitChanges();
      Alert.alert(title, message);
      return true;
    } catch (error: any) {
      Alert.alert(
        'Could Not Save to GitHub',
        error?.message || 'The change remains in memory but has not been committed. Refresh before retrying.',
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [commitChanges, reorderApps, repo]);

  const saveOneApp = useCallback(async (app: RepoApp, title: string) => {
    if (!repo) {
      Alert.alert('Repository Unavailable', 'Refresh the Apps page before adding an app.');
      return false;
    }
    if (repo.apps.some((existing) => existing.bundleIdentifier === app.bundleIdentifier)) {
      Alert.alert('Already Added', app.name + ' already exists in repo.json. Edit the existing app instead of duplicating it.');
      return false;
    }
    const importedApp = prepareNewImport(app);
    return persistApps([importedApp, ...repo.apps], title, app.name + ' was committed to repo.json.');
  }, [persistApps, repo]);

  const handleIpaUploaded = useCallback((result: IpaUploadResult) => {
    setDirectUrl(result.browserDownloadUrl);
    setDirectUploadSize(result.size);
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
    setDirectUploadSize(0);
  }, []);

  const handleAddDirect = useCallback(async () => {
    try {
      const downloadURL = normalizeHttpsUrl(directUrl, 'IPA download URL');
      const filename = downloadURL.split('/').pop()?.replace(/\.ipa(?:\?.*)?$/i, '') || 'Direct App';
      const name = directName.trim() || decodeURIComponent(filename).replace(/[-_]+/g, ' ');
      const iconURL = directIconUrl.trim() ? normalizeHttpsUrl(directIconUrl, 'Icon URL') : DEFAULT_ICON_URL;
      const description = directDescription.trim() || 'Imported from a verified direct IPA link.';
      const app: RepoApp = {
        name,
        bundleIdentifier: ['com', 'ryp0', 'direct', makeSlug(name), directLinkIdentifier(downloadURL)].join('.'),
        developerName: 'Direct Import',
        subtitle: description,
        localizedDescription: description,
        iconURL,
        category: directCategory,
        updatePolicy: 'static',
        status: { state: 'unknown' },
        versions: [{ version: '1.0.0', date: today(), downloadURL, size: directUploadSize }],
      };
      const saved = await saveOneApp(app, 'Direct IPA Added');
      if (saved) {
        setDirectUrl('');
        setDirectName('');
        setDirectDescription('');
        setDirectIconUrl('');
        setDirectUploadSize(0);
        setDirectUploaderGeneration((generation) => generation + 1);
      }
    } catch (error: any) {
      Alert.alert('Could Not Add Direct IPA', error instanceof ImportSourceError ? error.message : 'Check the IPA and icon URLs.');
    }
  }, [directCategory, directDescription, directIconUrl, directName, directUploadSize, directUrl, saveOneApp]);

  const handleAddGithub = useCallback(async () => {
    setIsSaving(true);
    try {
      const app = await importLatestGitHubRelease({
        repository: githubRepository,
        name: githubName,
        description: githubDescription,
        iconURL: githubIconUrl,
        category: githubCategory,
      });
      setIsSaving(false);
      const saved = await saveOneApp(app, 'GitHub App Added');
      if (saved) {
        setGithubRepository('');
        setGithubName('');
        setGithubDescription('');
        setGithubIconUrl('');
      }
    } catch (error: any) {
      Alert.alert('GitHub Import Failed', error?.message || 'Could not find a usable IPA or source metadata on GitHub.');
    } finally {
      setIsSaving(false);
    }
  }, [githubCategory, githubDescription, githubIconUrl, githubName, githubRepository, saveOneApp]);

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
    if (!repo) {
      Alert.alert('Repository Unavailable', 'Refresh the Apps page before merging.');
      return;
    }
    const selected = stagedApps
      .filter((item) => item.selected)
      .map(({ app, category }) => prepareNewImport({ ...app, category }));
    if (!selected.length) {
      Alert.alert('Select an App', 'Choose at least one app to merge into repo.json.');
      return;
    }
    const saved = await persistApps(
      [...repo.apps, ...selected],
      'Repository Merged',
      String(selected.length) + (selected.length === 1 ? ' app was' : ' apps were') + ' committed to repo.json.',
    );
    if (saved) {
      setIsReviewSheetPresented(false);
      setStagedApps([]);
      setRepoUrl('');
    }
  }, [persistApps, repo, stagedApps]);

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

      const saved = await saveOneApp(result.app, 'Telegram App Added');
      if (saved) {
        setTelegramName('');
        setTelegramDescription('');
        setTelegramSourceUrl('');
        setTelegramDeveloper('');
        setTelegramBundleId('');
        setTelegramIconUrl('');
      }
    } catch (error: any) {
      Alert.alert('Telegram Import Failed', error?.message || 'The Telegram import service could not process this message.');
    } finally {
      telegramSubmissionLock.current = false;
      setIsSaving(false);
    }
  }, [
    saveOneApp,
    router,
    telegramBundleId,
    telegramCategory,
    telegramDescription,
    telegramDeveloper,
    telegramIconUrl,
    telegramName,
    telegramSourceUrl,
  ]);

  const loadRequests = useCallback(async () => {
    setIsLoadingRequests(true);
    try {
      setRequests(await fetchAppRequests());
      setRequestsError(null);
    } catch (error: any) {
      setRequestsError(error?.message || 'Could not load app requests.');
    } finally {
      setIsLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    if (workspaceTab === 'requests' && isDeveloperMode) void loadRequests();
  }, [isDeveloperMode, loadRequests, workspaceTab]);

  const useRequestInImporter = useCallback((request: AppRequestRecord) => {
    const recommendation = recommendationFor(request);
    setWorkspaceTab('add');
    setImportMethod(recommendation.method);
    if (recommendation.method === 'direct') {
      setDirectUrl(request.sourceUrl);
      setDirectUploadSize(0);
      setDirectName(request.name);
      setDirectDescription(request.description);
      setDirectCategory(normalizedCategory(request.category));
    } else if (recommendation.method === 'github') {
      setGithubRepository(request.sourceUrl);
      setGithubName(request.name);
      setGithubDescription(request.description);
      setGithubCategory(normalizedCategory(request.category));
    } else if (recommendation.method === 'repo') {
      setRepoUrl(request.sourceUrl);
    } else {
      setTelegramName(request.name);
      setTelegramDescription(request.description);
      setTelegramSourceUrl(request.sourceUrl);
      setTelegramCategory(normalizedCategory(request.category));
    }
  }, []);

  const openRequestSource = useCallback(async (request: AppRequestRecord) => {
    try {
      const sourceUrl = getSafeExternalHttpsUrl(request.sourceUrl)
        ?? getSafeExternalHttpsUrl(request.issueUrl);
      if (!sourceUrl) throw new Error('unsafe URL');
      await Linking.openURL(sourceUrl);
    } catch {
      Alert.alert('Could Not Open Source', 'This request does not contain a usable source URL.');
    }
  }, []);

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
          onSelectCategory={(tab) => setWorkspaceTab(tab as WorkspaceTab)}
          accentColor={accent}
        />

        {workspaceTab === 'add' ? (
          <>
            <View style={[styles.guideCard, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
              <Text selectable style={[styles.guideTitle, { color: theme.label }]}>Add a source, then commit once</Text>
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
              <SectionCard title="Direct IPA" detail="Paste a verified HTTPS .ipa link, or choose a local IPA to upload as a public GitHub release asset. Nothing is added to repo.json until you commit below." theme={theme}>
                <IpaUploader
                  key={directUploaderGeneration}
                  accentColor={accent}
                  disabled={isSaving}
                  labelColor={theme.label}
                  secondaryLabelColor={theme.secondaryLabel}
                  onUploaded={handleIpaUploaded}
                />
                <FormField theme={theme} label="IPA Download URL" placeholder="https://example.com/app.ipa" value={directUrl} onChangeText={handleDirectUrlChange} autoCapitalize="none" keyboardType="url" />
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
              <SectionCard title="GitHub App Finder" detail="Checks stable releases first, then beta, nightly, alpha, and Source.JSON metadata. It prefers the app’s real icon over the developer profile image." theme={theme}>
                <FormField theme={theme} label="GitHub Repository" placeholder="owner/repository or https://github.com/owner/repository" value={githubRepository} onChangeText={setGithubRepository} autoCapitalize="none" />
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
                <Text selectable style={[styles.inputLabel, { color: theme.label }]}>Category</Text>
                <AppCategoryTabs categories={CATEGORIES} selectedCategory={telegramCategory} onSelectCategory={setTelegramCategory} accentColor={accent} />
                {primaryButton('Queue Telegram Import', () => void handleAddTelegram())}
              </SectionCard>
            ) : null}
          </>
        ) : null}

        {workspaceTab === 'requests' ? (
          <>
            <SectionCard title="Incoming App Requests" detail="A suggested action only pre-fills an import form. Nothing is published until you review it and commit through GitHub." theme={theme}>
              <TouchableOpacity accessibilityRole="button" onPress={() => void loadRequests()} style={[styles.secondaryButton, { borderColor: accent }]}>
                {isLoadingRequests ? <ActivityIndicator color={accent} /> : <Text style={[styles.secondaryButtonText, { color: accent }]}>Refresh Requests</Text>}
              </TouchableOpacity>
              {requestsError ? <Text selectable style={[styles.inlineError, { color: '#FF3B30' }]}>{requestsError}</Text> : null}
            </SectionCard>
            {requests.length ? requests.map((request) => {
              const recommendation = recommendationFor(request);
              return (
                <View key={request.id} style={[styles.requestCard, { backgroundColor: theme.surface, borderColor: theme.separator }]}>
                  <Text selectable style={[styles.requestTitle, { color: theme.label }]}>{request.name}</Text>
                  <Text selectable style={[styles.requestMeta, { color: theme.secondaryLabel }]}>
                    {request.category} · {request.method === 'direct-ipa' ? 'Direct IPA' : request.method === 'message-link' ? 'Message link' : 'Updatable source'}
                  </Text>
                  <Text selectable numberOfLines={3} style={[styles.requestDescription, { color: theme.secondaryLabel }]}>{request.description}</Text>
                  <Text selectable numberOfLines={1} style={[styles.requestSource, { color: accent }]}>{request.sourceUrl}</Text>
                  <View style={styles.requestSuggestion}>
                    <Text selectable style={[styles.suggestionTitle, { color: theme.label }]}>Suggested: {recommendation.label}</Text>
                    <Text selectable style={[styles.suggestionDetail, { color: theme.secondaryLabel }]}>{recommendation.detail}</Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity accessibilityRole="button" onPress={() => useRequestInImporter(request)} style={[styles.requestAction, { backgroundColor: accent }]}>
                      <Text style={styles.requestActionText}>Use {recommendation.label}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" onPress={() => void openRequestSource(request)} style={[styles.requestAction, styles.outlineRequestAction, { borderColor: accent }]}>
                      <Text style={[styles.outlineRequestActionText, { color: accent }]}>Open Source</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }) : (
              <SectionCard title={isLoadingRequests ? 'Loading Requests' : 'No Open Requests'} detail={isLoadingRequests ? 'Checking the request inbox…' : requestsError ? 'Fix the request API configuration, then refresh.' : 'New consumer submissions will appear here.'} theme={theme}>
                {!requestsError ? <Text selectable style={[styles.emptyRequestText, { color: theme.secondaryLabel }]}>You are all caught up.</Text> : null}
              </SectionCard>
            )}
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
            <SectionCard title="App Automations" detail="Review the GitHub Actions workflows that update your apps. Telegram importer workflows can be run, edited, disabled, or deleted here." theme={theme}>
              <TouchableOpacity accessibilityRole="button" onPress={() => router.push('/workflows')} style={[styles.submitBtn, { backgroundColor: accent }]}> 
                <Text style={styles.submitBtnText}>Manage GitHub Workflows</Text>
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
  field: { marginBottom: 14 },
  inputLabel: { marginBottom: 6, fontSize: 13, fontWeight: '600' },
  input: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, fontSize: 15 },
  multilineInput: { minHeight: 78, textAlignVertical: 'top' },
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
  inlineError: { marginTop: 12, fontSize: 13, lineHeight: 18 },
  requestCard: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, borderCurve: 'continuous' },
  requestTitle: { fontSize: 17, fontWeight: '700' },
  requestMeta: { marginTop: 4, fontSize: 12 },
  requestDescription: { marginTop: 10, fontSize: 13, lineHeight: 18 },
  requestSource: { marginTop: 10, fontSize: 12, fontWeight: '600' },
  requestSuggestion: { marginTop: 14 },
  suggestionTitle: { fontSize: 13, fontWeight: '700' },
  suggestionDetail: { marginTop: 3, fontSize: 12, lineHeight: 17 },
  requestActions: { flexDirection: 'row', gap: 8, marginTop: 15 },
  requestAction: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  requestActionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  outlineRequestAction: { borderWidth: 1 },
  outlineRequestActionText: { fontSize: 13, fontWeight: '700' },
  emptyRequestText: { fontSize: 14 },
  categorySummary: { marginBottom: 12 },
  categorySummaryRow: { minHeight: 42, alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
  categorySummaryLabel: { fontSize: 15 },
  categorySummaryValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
