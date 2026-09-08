import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Color, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Host } from '@expo/ui';
import {
  Button,
  ColorPicker,
  DatePicker,
  Form,
  GlassEffectContainer,
  HStack,
  Image,
  LabeledContent,
  Namespace,
  Picker,
  ScrollView,
  Section,
  Spacer,
  Text,
  TextField,
  useNativeState,
  VStack,
  ZStack,
} from '@expo/ui/swift-ui';
import {
  Animation,
  accessibilityLabel,
  animation,
  aspectRatio,
  autocorrectionDisabled,
  background,
  buttonStyle,
  clipShape,
  datePickerStyle,
  frame,
  font,
  foregroundColor,
  foregroundStyle,
  glassEffect,
  glassEffectId,
  keyboardType,
  labelsHidden,
  lineLimit,
  listRowBackground,
  listRowSeparator,
  listSectionSpacing,
  listStyle,
  multilineTextAlignment,
  opacity,
  padding,
  pickerStyle,
  resizable,
  tag,
  textFieldStyle,
  textInputAutocapitalization,
  tint,
  truncationMode,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { EditAppFormProps } from '../types/edit-app-form';
import type { RepoVersion } from '../types/repo';
import { getAppCardTheme } from './app-card-theme';
import { useRepoStore } from '../store/useRepoStore';
import { ACCENT_COLORS } from '../theme/app-preferences';

const DEFAULT_CATEGORIES = ['Sideloading', 'Games', 'Social', 'EMU', 'Movies', 'Tools'];
const EDIT_SECTIONS = [
  { id: 'card', label: 'Card App' },
  { id: 'page', label: 'Page' },
  { id: 'versions', label: 'Versions' },
] as const;
const SECONDARY = { type: 'hierarchical', style: 'secondary' } as const;
const TERTIARY = { type: 'hierarchical', style: 'tertiary' } as const;
function displayCategory(value?: string) {
  const category = value?.trim();
  if (!category) return 'Sideloading';
  return DEFAULT_CATEGORIES.find((option) => option.toLowerCase() === category.toLowerCase()) ?? category;
}

function sectionHeader(title: string) {
  return (
    <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle(SECONDARY)]}>
      {title}
    </Text>
  );
}

function previewBackgroundColor(tintColor: string, fallback: string) {
  const hex = tintColor.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fallback;

  const darkened = [0, 2, 4].map((offset) =>
    Math.round(parseInt(hex.slice(offset, offset + 2), 16) * 0.6)
  );
  return `#${darkened.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function dateTimeForRepository(date: Date) {
  // The repo accepts ISO 8601 strings. Keep seconds while omitting milliseconds
  // so hand-authored releases remain clean and sortable in repo.json.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function validateDirectIpaURL(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Enter a valid HTTPS link to an IPA file.';
  }

  if (url.protocol !== 'https:') {
    return 'Custom versions must use an HTTPS IPA link.';
  }

  if (url.username || url.password) {
    return 'IPA links cannot include a username or password.';
  }

  if (!url.pathname.toLowerCase().endsWith('.ipa')) {
    return 'The direct link must point to an .ipa file.';
  }

  return null;
}

function PreviewCard({
  app,
  index,
  name,
  subtitle,
  iconURL,
  tintColor,
}: {
  app: EditAppFormProps['app'];
  index: number;
  name: string;
  subtitle: string;
  iconURL: string;
  tintColor: string;
}) {
  const previewApp = { ...app, name, subtitle, iconURL, tintColor };
  const theme = getAppCardTheme(previewApp, index);
  const version = app.versions[0]?.version || '1.0';
  const displaySubtitle = subtitle || app.localizedDescription || `${name || 'App'} for iOS`;
  const previewBackground = previewBackgroundColor(tintColor, theme.bg);

  return (
    <ZStack
      modifiers={[
        frame({ maxWidth: 1000, height: 80 }),
        background(previewBackground, shapes.roundedRectangle({ cornerRadius: 16 })),
      ]}
    >
      <HStack spacing={12} modifiers={[frame({ maxWidth: 1000, height: 80 }), padding({ horizontal: 12 })]}>
        <ZStack modifiers={[frame({ width: 56, height: 56 })]}>
          {iconURL ? (
            <Image
              uiImage={iconURL}
              modifiers={[
                resizable(),
                aspectRatio({ contentMode: 'fill' }),
                frame({ width: 56, height: 56 }),
                clipShape('roundedRectangle', 12),
              ]}
            />
          ) : (
            <Image systemName="app.fill" size={24} modifiers={[foregroundColor('#FFFFFF')]} />
          )}
        </ZStack>
        <VStack alignment="leading" spacing={1} modifiers={[frame({ maxWidth: 1000, alignment: 'leading' })]}>
          <Text
            modifiers={[
              font({ size: 16, weight: 'bold' }),
              foregroundColor('#FFFFFF'),
              lineLimit(1),
              truncationMode('tail'),
            ]}
          >
            {name || 'App Name'}
          </Text>
          <Text
            modifiers={[
              font({ size: 12, weight: 'regular' }),
              foregroundColor('#FFFFFF'),
              opacity(0.65),
              lineLimit(1),
              truncationMode('tail'),
            ]}
          >
            {version} · {app.bundleIdentifier}
          </Text>
          <Text
            modifiers={[
              font({ size: 12, weight: 'regular' }),
              foregroundColor('#FFFFFF'),
              opacity(0.65),
              lineLimit(1),
              truncationMode('tail'),
            ]}
          >
            {displaySubtitle}
          </Text>
        </VStack>
        <Button
          onPress={() => void Haptics.selectionAsync()}
          modifiers={[
            buttonStyle('plain'),
            padding({ vertical: 8, horizontal: 16 }),
            background(theme.btn, shapes.capsule()),
          ]}
        >
          <Text modifiers={[font({ size: 14, weight: 'semibold' }), foregroundColor('#FFFFFF')]}>Install</Text>
        </Button>
      </HStack>
    </ZStack>
  );
}

export default function EditAppForm({
  app,
  appIndex,
  initialSection = 'card',
  onCancel,
  onSave,
}: EditAppFormProps) {
  const accentColor = useRepoStore((state) => state.accentColor);
  const tabNamespaceId = React.useId();
  const name = useNativeState(app.name || '');
  const subtitle = useNativeState(app.subtitle || '');
  const description = useNativeState(app.localizedDescription || '');
  const iconURL = useNativeState(app.iconURL || '');
  const [tintColor, setTintColor] = useState(app.tintColor || '#007AFF');
  const [category, setCategory] = useState(displayCategory(app.category));
  const [activeTab, setActiveTab] = useState<'card' | 'page' | 'versions'>(initialSection);
  const [previewName, setPreviewName] = useState(app.name || '');
  const [previewSubtitle, setPreviewSubtitle] = useState(app.subtitle || '');
  const [previewDescription, setPreviewDescription] = useState(app.localizedDescription || '');
  const [previewIconURL, setPreviewIconURL] = useState(app.iconURL || '');
  const [versions, setVersions] = useState<RepoVersion[]>(() => [...app.versions]);
  const customVersion = useNativeState('');
  const customDownloadURL = useNativeState('');
  const customDescription = useNativeState('');
  const [customReleaseDate, setCustomReleaseDate] = useState(() => new Date());
  const [customVersionError, setCustomVersionError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const selectedSectionIndex = EDIT_SECTIONS.findIndex((section) => section.id === activeTab);

  const categories = useMemo(() => {
    if (!category || DEFAULT_CATEGORIES.includes(category)) {
      return DEFAULT_CATEGORIES;
    }
    return [category, ...DEFAULT_CATEGORIES];
  }, [category]);

  useEffect(() => {
    name.value = app.name || '';
    subtitle.value = app.subtitle || '';
    description.value = app.localizedDescription || '';
    iconURL.value = app.iconURL || '';
    setTintColor(app.tintColor || '#007AFF');
    setCategory(displayCategory(app.category));
    setPreviewName(app.name || '');
    setPreviewSubtitle(app.subtitle || '');
    setPreviewDescription(app.localizedDescription || '');
    setPreviewIconURL(app.iconURL || '');
    setVersions([...app.versions]);
    customVersion.value = '';
    customDownloadURL.value = '';
    customDescription.value = '';
    setCustomReleaseDate(new Date());
    setCustomVersionError(null);
    setActiveTab(initialSection);
  }, [app.bundleIdentifier, initialSection]);

  const handleNameChange = useCallback((value: string) => {
    name.value = value;
    setPreviewName(value);
  }, [name]);

  const handleSubtitleChange = useCallback((value: string) => {
    subtitle.value = value;
    setPreviewSubtitle(value);
  }, [subtitle]);

  const handleIconURLChange = useCallback((value: string) => {
    iconURL.value = value;
    setPreviewIconURL(value);
  }, [iconURL]);

  const handleDescriptionChange = useCallback((value: string) => {
    description.value = value;
    setPreviewDescription(value);
  }, [description]);

  const handleCustomVersionChange = useCallback((value: string) => {
    customVersion.value = value;
    if (customVersionError) setCustomVersionError(null);
  }, [customVersion, customVersionError]);

  const handleCustomDownloadURLChange = useCallback((value: string) => {
    customDownloadURL.value = value;
    if (customVersionError) setCustomVersionError(null);
  }, [customDownloadURL, customVersionError]);

  const handleCustomDescriptionChange = useCallback((value: string) => {
    customDescription.value = value;
  }, [customDescription]);

  const handleAddCustomVersion = () => {
    const version = customVersion.value.trim();
    const downloadURL = customDownloadURL.value.trim();
    const localizedDescription = customDescription.value.trim();

    if (!version) {
      setCustomVersionError('Enter a version number before adding this release.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (version.length > 100) {
      setCustomVersionError('Version numbers must be 100 characters or fewer.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (downloadURL.length > 2_000) {
      setCustomVersionError('The IPA link is too long.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const urlError = validateDirectIpaURL(downloadURL);
    if (urlError) {
      setCustomVersionError(urlError);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (localizedDescription.length > 2_000) {
      setCustomVersionError('Release descriptions must be 2,000 characters or fewer.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (versions.some((existing) => existing.downloadURL.trim() === downloadURL)) {
      setCustomVersionError('This IPA link is already in the version history.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const release: RepoVersion = {
      version,
      date: dateTimeForRepository(customReleaseDate),
      downloadURL,
      // Direct links do not reliably expose a content length without a server
      // request. The repository schema requires a number, so use the same safe
      // zero-byte placeholder as the direct-IPA importer.
      size: 0,
      ...(localizedDescription ? { localizedDescription } : {}),
    };

    // The first entry is the version package managers treat as latest.
    setVersions((current) => [release, ...current]);
    customVersion.value = '';
    customDownloadURL.value = '';
    customDescription.value = '';
    setCustomReleaseDate(new Date());
    setCustomVersionError(null);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCancel = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      await onSave({
        name: name.value.trim(),
        subtitle: subtitle.value.trim(),
        localizedDescription: description.value.trim(),
        iconURL: iconURL.value.trim(),
        tintColor,
        category,
        versions,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyBundleIdentifier = async () => {
    try {
      // Keep the app bootable on the currently installed dev client, which predates
      // expo-clipboard. The native module is loaded only when this action is used.
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(app.bundleIdentifier);
      void Haptics.selectionAsync();
    } catch (error) {
      console.warn('Clipboard is unavailable in this development build.', error);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerBackVisible: false,
          headerShadowVisible: false,
          headerTitleAlign: 'center',
          headerStyle: { backgroundColor: Color.ios.systemGroupedBackground },
          contentStyle: { backgroundColor: Color.ios.systemGroupedBackground },
          title: 'Edit',
        }}
      />
      <Stack.Title style={{ fontSize: 17, fontWeight: '600' }}>Edit</Stack.Title>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Cancel editing"
          icon="xmark"
          onPress={handleCancel}
          separateBackground
        />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel="Save changes"
          icon="checkmark"
          onPress={handleSave}
          disabled={isSaving}
          separateBackground
          tintColor={Color.ios.systemBlue}
          variant="prominent"
        />
      </Stack.Toolbar>

      <Host style={{ flex: 1 }}>
        <VStack spacing={0}>
          <Namespace id={tabNamespaceId}>
            <ScrollView axes="horizontal" showsIndicators={false}>
              <GlassEffectContainer spacing={8}>
                <HStack
                  spacing={8}
                  modifiers={[
                    padding({ horizontal: 16, vertical: 6 }),
                    animation(Animation.spring({ response: 0.32, dampingFraction: 0.82 }), selectedSectionIndex),
                  ]}
                >
                  {EDIT_SECTIONS.map((section) => {
                    const selected = section.id === activeTab;
                    return (
                      <Button
                        key={section.id}
                        label={section.label}
                        onPress={() => setActiveTab(section.id)}
                        modifiers={[
                          buttonStyle('plain'),
                          foregroundStyle(selected ? '#FFFFFF' : Color.ios.label),
                          padding({ horizontal: 16, vertical: 9 }),
                          glassEffect({
                            glass: {
                              variant: selected ? 'regular' : 'clear',
                              interactive: true,
                              tint: selected ? ACCENT_COLORS[accentColor].value : undefined,
                            },
                            shape: 'capsule',
                          }),
                          ...(selected ? [glassEffectId('selected-edit-section', tabNamespaceId)] : []),
                        ]}
                      />
                    );
                  })}
                </HStack>
              </GlassEffectContainer>
            </ScrollView>
          </Namespace>

          {activeTab === 'card' ? (
            <Form modifiers={[listStyle('insetGrouped'), listSectionSpacing(10)]}>
          <Section
            header={sectionHeader('App Info')}
            modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
          >
            <HStack>
              <Text>Name</Text>
              <Spacer />
              <TextField
                text={name}
                onTextChange={handleNameChange}
                placeholder="App name"
                modifiers={[
                  textFieldStyle('plain'),
                  multilineTextAlignment('trailing'),
                  foregroundStyle(SECONDARY),
                  frame({ width: 220, alignment: 'trailing' }),
                  lineLimit(1),
                  truncationMode('tail'),
                ]}
              />
            </HStack>
            <HStack>
              <Text>Subtitle</Text>
              <Spacer />
              <TextField
                text={subtitle}
                onTextChange={handleSubtitleChange}
                placeholder="Subtitle"
                modifiers={[
                  textFieldStyle('plain'),
                  multilineTextAlignment('trailing'),
                  foregroundStyle(SECONDARY),
                  frame({ width: 220, alignment: 'trailing' }),
                  lineLimit(1),
                  truncationMode('tail'),
                ]}
              />
            </HStack>
          </Section>

          <Section
            header={sectionHeader('Bundle Identifier (Read-only)')}
            modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
          >
            <HStack>
              <Text modifiers={[lineLimit(1), truncationMode('middle')]}>
                {app.bundleIdentifier}
              </Text>
              <Spacer />
              <Button
                onPress={handleCopyBundleIdentifier}
                modifiers={[
                  accessibilityLabel('Copy bundle identifier'),
                  buttonStyle('plain'),
                  tint(Color.ios.systemBlue),
                ]}
              >
                <Image systemName="doc.on.doc" size={17} color={Color.ios.systemBlue} />
              </Button>
            </HStack>
          </Section>

          <Section
            header={sectionHeader('Assets')}
            modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
          >
            <HStack>
              <Text>Icon URL</Text>
              <Spacer />
              <TextField
                text={iconURL}
                onTextChange={handleIconURLChange}
                placeholder="https://"
                modifiers={[
                  textFieldStyle('plain'),
                  multilineTextAlignment('trailing'),
                  foregroundStyle(SECONDARY),
                  lineLimit(1),
                  truncationMode('tail'),
                  keyboardType('url'),
                  textInputAutocapitalization('never'),
                  autocorrectionDisabled(),
                  frame({ width: 220, alignment: 'trailing' }),
                ]}
              />
            </HStack>
          </Section>

          <Section
            header={sectionHeader('Design')}
            modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
          >
            <LabeledContent label="Tint Color">
              <HStack>
                <Text modifiers={[foregroundStyle(SECONDARY)]}>{tintColor.toUpperCase()}</Text>
                <ColorPicker
                  selection={tintColor}
                  supportsOpacity={false}
                  onSelectionChange={setTintColor}
                  modifiers={[labelsHidden()]}
                />
              </HStack>
            </LabeledContent>
            <Picker
              label="Category"
              selection={category}
              onSelectionChange={(value) => value && setCategory(value)}
              modifiers={[pickerStyle('menu'), tint(Color.ios.systemBlue)]}
            >
              {categories.map((option) => (
                <Text key={option} modifiers={[tag(option)]}>
                  {option}
                </Text>
              ))}
            </Picker>
          </Section>
          <Section
            header={sectionHeader('Preview')}
            modifiers={[listRowBackground('clear'), listRowSeparator('hidden')]}
          >
            <PreviewCard
              app={app}
              index={appIndex}
              name={previewName}
              subtitle={previewSubtitle}
              iconURL={previewIconURL}
              tintColor={tintColor}
            />
          </Section>
            </Form>
          ) : activeTab === 'page' ? (
            <Form modifiers={[listStyle('insetGrouped'), listSectionSpacing(10)]}>
              <Section
                header={sectionHeader('Page Description')}
                modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
              >
                <TextField
                  text={description}
                  axis="vertical"
                  onTextChange={handleDescriptionChange}
                  placeholder="Describe this app for its package page"
                  modifiers={[textFieldStyle('plain'), lineLimit(5)]}
                />
              </Section>
              <Section
                header={sectionHeader('Page Preview')}
                modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
              >
                <VStack alignment="leading" spacing={6}>
                  <Text modifiers={[font({ size: 20, weight: 'bold' })]}>{previewName || 'App Name'}</Text>
                  <Text modifiers={[foregroundStyle(SECONDARY)]}>
                    {previewDescription || previewSubtitle || 'A description will appear here.'}
                  </Text>
                </VStack>
              </Section>
            </Form>
          ) : (
            <Form modifiers={[listStyle('insetGrouped'), listSectionSpacing(10)]}>
              <Section
                header={sectionHeader('Add Custom Version')}
                modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
              >
                <VStack alignment="leading" spacing={7}>
                  <Text modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(SECONDARY)]}>
                    Direct IPA URL
                  </Text>
                  <TextField
                    text={customDownloadURL}
                    onTextChange={handleCustomDownloadURLChange}
                    placeholder="https://example.com/App.ipa"
                    modifiers={[
                      textFieldStyle('plain'),
                      keyboardType('url'),
                      textInputAutocapitalization('never'),
                      autocorrectionDisabled(),
                    ]}
                  />
                </VStack>
                <VStack alignment="leading" spacing={7}>
                  <Text modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(SECONDARY)]}>
                    Version
                  </Text>
                  <TextField
                    text={customVersion}
                    onTextChange={handleCustomVersionChange}
                    placeholder="1.2.0"
                    modifiers={[textFieldStyle('plain'), textInputAutocapitalization('never'), autocorrectionDisabled()]}
                  />
                </VStack>
                <DatePicker
                  title="Release Date & Time"
                  selection={customReleaseDate}
                  displayedComponents={['date', 'hourAndMinute']}
                  onDateChange={setCustomReleaseDate}
                  modifiers={[datePickerStyle('compact'), tint(Color.ios.systemBlue)]}
                />
                <VStack alignment="leading" spacing={7}>
                  <Text modifiers={[font({ size: 14, weight: 'medium' }), foregroundStyle(SECONDARY)]}>
                    Release Description
                  </Text>
                  <TextField
                    text={customDescription}
                    axis="vertical"
                    onTextChange={handleCustomDescriptionChange}
                    placeholder="What changed in this release?"
                    modifiers={[textFieldStyle('plain'), lineLimit(4)]}
                  />
                </VStack>
                {customVersionError ? (
                  <Text modifiers={[font({ size: 14 }), foregroundColor(Color.ios.systemRed)]}>
                    {customVersionError}
                  </Text>
                ) : (
                  <Text modifiers={[font({ size: 13 }), foregroundStyle(SECONDARY)]}>
                    The release date starts at your current date and time. Save Changes publishes it to repo.json.
                  </Text>
                )}
                <Button
                  label="Add Custom Version"
                  systemImage="plus.circle.fill"
                  onPress={handleAddCustomVersion}
                  modifiers={[buttonStyle('borderedProminent'), tint(Color.ios.systemBlue)]}
                />
              </Section>
              <Section
                header={sectionHeader(`Versions (${versions.length})`)}
                modifiers={[listRowBackground(Color.ios.secondarySystemGroupedBackground)]}
              >
                {versions.map((release, index) => (
                  <HStack key={`${release.version}-${release.date}-${release.downloadURL}`}>
                    <VStack alignment="leading" spacing={2}>
                      <HStack spacing={6}>
                        <Text modifiers={[font({ size: 17, weight: 'semibold' })]}>{release.version}</Text>
                        {index === 0 ? (
                          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundColor(Color.ios.systemBlue)]}>
                            Latest
                          </Text>
                        ) : null}
                      </HStack>
                      <Text modifiers={[font({ size: 14 }), foregroundStyle(SECONDARY)]}>
                        {release.date}
                      </Text>
                      {release.localizedDescription ? (
                        <Text modifiers={[font({ size: 13 }), foregroundStyle(SECONDARY), lineLimit(1), truncationMode('tail')]}>
                          {release.localizedDescription}
                        </Text>
                      ) : null}
                    </VStack>
                    <Spacer />
                    <Image systemName="chevron.right" size={14} modifiers={[foregroundStyle(TERTIARY)]} />
                  </HStack>
                ))}
              </Section>
            </Form>
          )}
        </VStack>
      </Host>
    </>
  );
}
