import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MenuView } from '@expo/ui/community/menu';
import type { RepoApp, RepoVersion } from '../types/repo';
import { useRepoStore } from '../store/useRepoStore';
import { getAppCardTheme } from './app-card-theme';
import AppCardContextMenu, { type AppCardContextMenuAction } from './app-card-context-menu';
import { installInLiveContainer } from '../services/livecontainer';
import AppCardVisual from './app-card-visual';
import { APP_CARD_HEIGHT } from './app-card-visual.types';
import { getAppStatus, getAppStatusKey, getAppUpdatePolicy } from '../services/app-status';
import { requireSafeExternalHttpsUrl } from '../services/safe-url';

interface AppCardProps {
  app: RepoApp;
  drag: () => void;
  isActive: boolean;
  onOpen?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  index: number;
}

function versionLabel(version: RepoVersion) {
  return version.date ? `${version.version} · ${version.date}` : version.version;
}

function AppCardComponent({ app, drag, isActive, onOpen, onEdit, onDelete, onDuplicate, index }: AppCardProps) {
  const isDeveloperMode = useRepoStore((state) => state.isDeveloperMode);
  const runtimeStatus = useRepoStore((state) => state.runtimeAppStatuses[getAppStatusKey(app)]);
  const { width: viewportWidth } = useWindowDimensions();
  const isOpeningRef = useRef(false);
  const openResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestVersion = app.versions?.[0];
  const latestVersionLabel = latestVersion?.version || 'Unavailable';
  const subtitle = app.subtitle || app.localizedDescription || `${app.name} for iOS`;
  const theme = getAppCardTheme(app, index);
  const appStatus = getAppStatus(app, runtimeStatus ?? app.status);
  const typeLabel = getAppUpdatePolicy(app) === 'daily' ? 'Daily Update' : 'Static';
  const cardWidth = Math.max(1, viewportWidth - 32);

  const openVersion = useCallback(async (version: RepoVersion) => {
    if (!version.downloadURL) {
      Alert.alert('Installation Unavailable', 'This release has no IPA download link.');
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Linking.openURL(requireSafeExternalHttpsUrl(version.downloadURL, 'This IPA download link'));
    } catch (error: any) {
      Alert.alert('Installation', error?.message || 'Unable to open the IPA download link.');
    }
  }, []);

  const copyVersionLink = useCallback(async (version: RepoVersion) => {
    if (!version.downloadURL) {
      Alert.alert('Link Unavailable', 'This release has no IPA download link.');
      return;
    }

    try {
      const safeDownloadURL = requireSafeExternalHttpsUrl(version.downloadURL, 'This IPA download link');
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(safeDownloadURL);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('IPA Link Copied', `${version.version} is ready to paste or share.`);
    } catch (error: any) {
      Alert.alert('Could Not Copy Link', error?.message || 'Clipboard access is unavailable.');
    }
  }, []);

  const installVersionInLiveContainer = useCallback(async (version: RepoVersion) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await installInLiveContainer(version);
    } catch (error: any) {
      Alert.alert('LiveContainer', error?.message || 'Unable to hand this IPA to LiveContainer.');
    }
  }, []);

  const installMenuActions = useMemo(() => {
    const versions = app.versions || [];
    const actions: any[] = latestVersion
      ? [{ id: 'install-latest', title: `Install IPA (${latestVersion.version})`, image: 'arrow.down.circle' }]
      : [];

    if (versions.length > 1) {
      actions.push({
        id: 'other-versions',
        title: 'Other Versions',
        image: 'clock.arrow.circlepath',
        subactions: versions.slice(1).map((version, versionIndex) => ({
          id: `install-version-${versionIndex + 1}`,
          title: versionLabel(version),
          image: 'arrow.down.circle',
        })),
      });
    }

    if (versions.length) {
      actions.push({
        id: 'livecontainer',
        title: 'Install in LiveContainer',
        image: 'shippingbox',
        subactions: versions.map((version, versionIndex) => ({
          id: `livecontainer-version-${versionIndex}`,
          title: versionLabel(version),
          image: 'shippingbox',
        })),
      });
      actions.push({
        id: 'share-ipa',
        title: 'Share IPA',
        image: 'square.and.arrow.up',
        subactions: versions.map((version, versionIndex) => ({
          id: `copy-version-${versionIndex}`,
          title: versionLabel(version),
          image: 'doc.on.doc',
        })),
      });
    }

    if (isDeveloperMode) {
      actions.push(
        { id: 'edit', title: 'Edit Metadata', image: 'square.and.pencil' },
        { id: 'duplicate', title: 'Duplicate App', image: 'doc.on.doc' },
        { id: 'delete', title: 'Delete App', image: 'trash', attributes: { destructive: true } },
      );
    }

    return actions;
  }, [app.versions, isDeveloperMode, latestVersion]);

  const handleInstallMenuAction = useCallback(({ nativeEvent }: { nativeEvent: { event: string } }) => {
    const event = nativeEvent.event;

    if (event === 'install-latest' && latestVersion) {
      void openVersion(latestVersion);
      return;
    }
    if (event.startsWith('install-version-')) {
      const versionIndex = Number(event.replace('install-version-', ''));
      const version = app.versions?.[versionIndex];
      if (version) void openVersion(version);
      return;
    }
    if (event.startsWith('copy-version-')) {
      const versionIndex = Number(event.replace('copy-version-', ''));
      const version = app.versions?.[versionIndex];
      if (version) void copyVersionLink(version);
      return;
    }
    if (event.startsWith('livecontainer-version-')) {
      const versionIndex = Number(event.replace('livecontainer-version-', ''));
      const version = app.versions?.[versionIndex];
      if (version) void installVersionInLiveContainer(version);
      return;
    }
    if (event === 'edit') onEdit();
    if (event === 'duplicate') onDuplicate();
    if (event === 'delete') onDelete();
  }, [app.versions, copyVersionLink, installVersionInLiveContainer, latestVersion, onDelete, onDuplicate, onEdit, openVersion]);

  useEffect(() => () => {
    if (openResetTimerRef.current) clearTimeout(openResetTimerRef.current);
  }, []);

  const openDetails = useCallback(() => {
    // Navigation is asynchronous. Ignore accidental repeat taps until the route
    // transition begins, so one card interaction can never push two detail views.
    if (!onOpen || isOpeningRef.current) return;

    isOpeningRef.current = true;
    onOpen();
    openResetTimerRef.current = setTimeout(() => {
      isOpeningRef.current = false;
      openResetTimerRef.current = null;
    }, 750);
  }, [onOpen]);

  const cardMenuActions = useMemo<AppCardContextMenuAction[]>(() => {
    const versions = app.versions || [];
    const actions: AppCardContextMenuAction[] = [];

    if (onOpen) {
      actions.push({ id: 'view-details', title: 'View Details', image: 'info.circle', onPress: openDetails });
    }
    if (latestVersion) {
      actions.push({
        id: 'install-latest',
        title: `Install IPA (${latestVersion.version})`,
        image: 'arrow.down.circle',
        onPress: () => void openVersion(latestVersion),
      });
    }
    if (versions.length > 1) {
      actions.push({
        id: 'other-versions',
        title: 'Other Versions',
        image: 'clock.arrow.circlepath',
        subactions: versions.slice(1).map((version, versionIndex) => ({
          id: `install-version-${versionIndex + 1}`,
          title: versionLabel(version),
          image: 'arrow.down.circle',
          onPress: () => void openVersion(version),
        })),
      });
    }
    if (versions.length) {
      actions.push({
        id: 'livecontainer',
        title: 'Install in LiveContainer',
        image: 'shippingbox',
        subactions: versions.map((version, versionIndex) => ({
          id: `livecontainer-version-${versionIndex}`,
          title: versionLabel(version),
          image: 'shippingbox',
          onPress: () => void installVersionInLiveContainer(version),
        })),
      });
      actions.push({
        id: 'share-ipa',
        title: 'Share IPA',
        image: 'square.and.arrow.up',
        subactions: versions.map((version, versionIndex) => ({
          id: `copy-version-${versionIndex}`,
          title: versionLabel(version),
          image: 'doc.on.doc',
          onPress: () => void copyVersionLink(version),
        })),
      });
    }
    if (isDeveloperMode) {
      actions.push(
        { id: 'edit', title: 'Edit Metadata', image: 'square.and.pencil', onPress: onEdit },
        { id: 'duplicate', title: 'Duplicate App', image: 'doc.on.doc', onPress: onDuplicate },
        { id: 'delete', title: 'Delete App', image: 'trash', destructive: true, onPress: onDelete },
      );
    }

    return actions;
  }, [app.versions, copyVersionLink, installVersionInLiveContainer, isDeveloperMode, latestVersion, onDelete, onDuplicate, onEdit, onOpen, openDetails, openVersion]);

  return (
    <View style={styles.cardWrapper}>
      <View
        style={[
          styles.cardContainer,
          isActive && styles.activeCard,
        ]}
      >
        <View style={styles.cardVisualContainer}>
          <AppCardVisual
            app={app}
            latestVersionLabel={latestVersionLabel}
            subtitle={subtitle}
            theme={theme}
            typeLabel={typeLabel}
            statusLabel={appStatus.label}
            statusColor={appStatus.color}
            statusSymbol={appStatus.symbol}
          />
        </View>

        {/* The visible card remains an ordinary fixed-height list cell. SwiftUI
            owns the long-press lift and the continuous rounded preview; adding
            a JS press-scale here makes that native animation jump. */}
        <AppCardContextMenu
          title={app.name}
          actions={cardMenuActions}
          style={styles.cardContextMenu}
          preview={(
            <AppCardVisual
              app={app}
              latestVersionLabel={latestVersionLabel}
              subtitle={subtitle}
              theme={theme}
              typeLabel={typeLabel}
              statusLabel={appStatus.label}
              statusColor={appStatus.color}
              statusSymbol={appStatus.symbol}
              preview
              fixedWidth={cardWidth}
            />
          )}
        >
          <Pressable
            style={[styles.cardTapTarget, { width: cardWidth }]}
            accessibilityLabel={onOpen ? `View ${app.name}` : undefined}
            accessibilityRole={onOpen ? 'button' : undefined}
            disabled={!onOpen}
            onPress={openDetails}
          />
        </AppCardContextMenu>

        {isDeveloperMode ? (
          <TouchableOpacity
            onLongPress={drag}
            delayLongPress={400}
            style={styles.dragTarget}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityLabel={`Drag ${app.name}`}
          />
        ) : null}

        {/* A genuine SwiftUI Menu, independent from the full-card navigation target. */}
        <MenuView
          title={app.name}
          actions={installMenuActions}
          onPressAction={handleInstallMenuAction}
          style={styles.installMenu}
        >
          <View style={[styles.installButton, { backgroundColor: theme.btn }]}>
            <Text style={styles.installText}>Install</Text>
          </View>
        </MenuView>
      </View>
    </View>
  );
}

export const AppCard = React.memo(AppCardComponent, (previous, next) => (
  previous.app === next.app &&
  previous.index === next.index &&
  previous.isActive === next.isActive
));

const styles = StyleSheet.create({
  cardWrapper: { width: '100%', paddingHorizontal: 16, marginBottom: 14 },
  cardContainer: {
    position: 'relative', width: '100%', height: APP_CARD_HEIGHT, borderRadius: 22,
  },
  cardVisualContainer: { width: '100%', height: APP_CARD_HEIGHT, borderRadius: 22 },
  cardContextMenu: { ...StyleSheet.absoluteFill, zIndex: 1 },
  cardTapTarget: { width: '100%', height: APP_CARD_HEIGHT, borderRadius: 22 },
  activeCard: { opacity: 0.96 },
  dragTarget: { position: 'absolute', zIndex: 2, left: 12, top: 12, bottom: 12, width: 16 },
  installMenu: { position: 'absolute', zIndex: 3, right: 16, top: 17 },
  installButton: { paddingVertical: 9, paddingHorizontal: 15, borderRadius: 100, justifyContent: 'center', alignItems: 'center', minWidth: 74 },
  installText: { color: '#1C1C1E', fontSize: 14, fontWeight: '700' },
});
