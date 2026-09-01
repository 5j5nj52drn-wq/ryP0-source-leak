import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Share, Alert } from 'react-native';
import { Image } from 'expo-image';
import { RepoApp } from '../types/repo';
import { useRepoStore } from '../store/useRepoStore';
import { MenuView } from '@expo/ui/community/menu';

interface AppCardProps {
  app: RepoApp;
  drag: () => void;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  index: number;
}

// Preset themes from Figma design
const CARD_THEMES = [
  { bg: '#4A2D6E', btn: '#9B59D0', nameMatch: ['amethyst', 'minecraft'] },
  { bg: '#6B1E2E', btn: '#E05A6E', nameMatch: ['melonx', 'melon', 'yuzu', 'ryujinx'] },
  { bg: '#1A3A6E', btn: '#3B7DE8', nameMatch: ['dolphin', 'dolphinios'] },
  { bg: '#1E2D5A', btn: '#3B7DE8', nameMatch: ['ppsspp', 'psp'] },
  { bg: '#1A2D5E', btn: '#2563EB', nameMatch: ['ipsx2', 'pcsx2', 'ps2'] },
  { bg: '#134E4A', btn: '#14B8A6', nameMatch: ['retroarch', 'emu'] },
  { bg: '#312E81', btn: '#6366F1', nameMatch: ['scarlet', 'sidestore', 'altstore'] },
  { bg: '#701A75', btn: '#D946EF', nameMatch: ['movie', 'video', 'stream'] },
  { bg: '#1E293B', btn: '#38BDF8', nameMatch: [] },
];

function getCardTheme(app: RepoApp, index: number) {
  const lowerName = (app.name || '').toLowerCase();
  const lowerBundle = (app.bundleIdentifier || '').toLowerCase();

  for (const theme of CARD_THEMES) {
    if (theme.nameMatch.some(k => lowerName.includes(k) || lowerBundle.includes(k))) {
      return theme;
    }
  }

  if (app.tintColor && app.tintColor.startsWith('#') && app.tintColor.length >= 7) {
    return {
      bg: app.tintColor,
      btn: '#3B82F6',
    };
  }

  return CARD_THEMES[index % CARD_THEMES.length];
}

export function AppCard({ app, drag, isActive, onEdit, onDelete, onDuplicate, index }: AppCardProps) {
  const isDeveloperMode = useRepoStore(state => state.isDeveloperMode);
  const installApp = useRepoStore(state => state.installApp);

  const latestVersion = app.versions?.[0]?.version || '1.0';
  const subtitle = app.subtitle || app.localizedDescription || `${app.name} for iOS`;
  const theme = getCardTheme(app, index);

  const handleInstallPress = async () => {
    try {
      await installApp(app);
    } catch (e: any) {
      Alert.alert('Installation', e.message);
    }
  };

  const handleShare = async () => {
    const downloadURL = app.versions?.[0]?.downloadURL;
    if (downloadURL) {
      await Share.share({
        title: app.name,
        message: `Download ${app.name} (${latestVersion}): ${downloadURL}`,
        url: downloadURL,
      });
    }
  };

  // Build context menu actions depending on role
  const menuActions = isDeveloperMode
    ? [
        { id: 'install', title: 'Install IPA', image: 'arrow.down.circle' },
        { id: 'edit', title: 'Edit Metadata', image: 'square.and.pencil' },
        { id: 'duplicate', title: 'Duplicate App', image: 'doc.on.doc' },
        { id: 'share', title: 'Share App', image: 'square.and.arrow.up' },
        { id: 'delete', title: 'Delete App', image: 'trash', attributes: { destructive: true } },
      ]
    : [
        { id: 'install', title: 'Install App', image: 'arrow.down.circle' },
        { id: 'share', title: 'Share App', image: 'square.and.arrow.up' },
      ];

  return (
    <View style={styles.cardWrapper}>
      <MenuView
        shouldOpenOnLongPress={true}
        actions={menuActions}
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === 'install') handleInstallPress();
          if (nativeEvent.event === 'edit') onEdit();
          if (nativeEvent.event === 'duplicate') onDuplicate();
          if (nativeEvent.event === 'delete') onDelete();
          if (nativeEvent.event === 'share') handleShare();
        }}
      >
        <View
          style={[
            styles.cardContainer,
            { backgroundColor: theme.bg },
            isActive && styles.activeCard,
          ]}
        >
          {/* Drag Handle Dot Indicator (Only visible in Developer Mode) */}
          {isDeveloperMode && (
            <TouchableOpacity
              onLongPress={drag}
              delayLongPress={100}
              style={styles.dragPill}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <View style={styles.dragDot} />
            </TouchableOpacity>
          )}

          {/* App Icon */}
          <Image
            source={{ uri: app.iconURL }}
            style={styles.appIcon}
            contentFit="cover"
            transition={200}
          />

          {/* App Info Column */}
          <View style={styles.infoColumn}>
            <Text style={styles.appTitle} numberOfLines={1}>
              {app.name}
            </Text>
            <Text style={styles.versionBundle} numberOfLines={1}>
              {latestVersion} · {app.bundleIdentifier}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>

          {/* Action Button: "Install" for Users / "Install" with Quick Edit for Devs */}
          <TouchableOpacity
            onPress={isDeveloperMode ? onEdit : handleInstallPress}
            activeOpacity={0.8}
            style={[styles.installButton, { backgroundColor: theme.btn }]}
          >
            <Text style={styles.installText}>
              {isDeveloperMode ? 'Edit' : 'Install'}
            </Text>
          </TouchableOpacity>
        </View>
      </MenuView>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  activeCard: {
    transform: [{ scale: 1.03 }],
    shadowOpacity: 0.35,
    shadowRadius: 20,
    zIndex: 999,
  },
  dragPill: {
    paddingVertical: 8,
    paddingRight: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dragDot: {
    width: 5,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#D9D9D9',
  },
  appIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    marginRight: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  infoColumn: {
    flex: 1,
    justifyContent: 'center',
    marginRight: 8,
  },
  appTitle: {
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Inter' : 'System',
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  versionBundle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: Platform.OS === 'ios' ? 'Inter' : 'System',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  subtitle: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontFamily: Platform.OS === 'ios' ? 'Inter' : 'System',
    fontSize: 12,
    fontWeight: '400',
    marginTop: 1,
  },
  installButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  installText: {
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Inter' : 'System',
    fontSize: 14,
    fontWeight: '600',
  },
});
