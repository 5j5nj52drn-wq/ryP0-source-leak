import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  useColorScheme,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useRouter, Stack } from 'expo-router';
import { useRepoStore } from '../../../store/useRepoStore';
import { useShallow } from 'zustand/react/shallow';
import { isScrollingDown, scrollY } from '../../../store/sharedScroll';
import { AppCard } from '../../../components/AppCard';
import { APP_CARD_HEIGHT } from '../../../components/app-card-visual.types';
import AppCategoryTabs from '../../../components/app-category-tabs';
import { RepoApp } from '../../../types/repo';
import { Inbox } from 'lucide-react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACCENT_COLORS, useAppTheme } from '../../../theme/app-preferences';

const CATEGORIES = [
  { id: 'all', label: 'All Apps' },
  { id: 'sideloading', label: 'Sideloading' },
  { id: 'games', label: 'Games' },
  { id: 'social', label: 'Social' },
  { id: 'emu', label: 'EMU' },
  { id: 'movies', label: 'Movies' },
  { id: 'tools', label: 'Tools' },
];

const APP_CARD_ROW_HEIGHT = APP_CARD_HEIGHT + 14;
const NOOP = () => {};
const getAppItemLayout = (_: ArrayLike<RepoApp> | null | undefined, index: number) => ({
  length: APP_CARD_ROW_HEIGHT,
  offset: APP_CARD_ROW_HEIGHT * index,
  index,
});

export default function HomeScreen() {
  const router = useRouter();
  const {
    repo,
    isLoading,
    error,
    fetchRepo,
    reorderApps,
    commitChanges,
    isDeveloperMode,
    initializeStore,
    searchQuery,
    accentColor,
  } = useRepoStore(useShallow((state) => ({
    repo: state.repo,
    isLoading: state.isLoading,
    error: state.error,
    fetchRepo: state.fetchRepo,
    reorderApps: state.reorderApps,
    commitChanges: state.commitChanges,
    isDeveloperMode: state.isDeveloperMode,
    initializeStore: state.initializeStore,
    searchQuery: state.searchQuery,
    accentColor: state.accentColor,
  })));
  const theme = useAppTheme();
  const safeAreaInsets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const toolbarThemeKey = colorScheme === 'dark' ? 'dark' : 'light';

  const [selectedCategory, setSelectedCategory] = useState('all');
  const selectedCategoryRef = useRef(selectedCategory);

  useEffect(() => {
    selectedCategoryRef.current = selectedCategory;
  }, [selectedCategory]);

  const commitAfterChange = useCallback(async (successMessage?: string) => {
    try {
      await commitChanges();
      if (successMessage) Alert.alert('Saved to GitHub', successMessage);
    } catch (error: any) {
      Alert.alert(
        'Could Not Save to GitHub',
        error?.message || 'The change has not been committed. Refresh the repository before retrying.',
      );
    }
  }, [commitChanges]);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      if (event.contentOffset.y > 50) {
        if (event.contentOffset.y > scrollY.value + 5) {
          isScrollingDown.value = true;
        } else if (event.contentOffset.y < scrollY.value - 5) {
          isScrollingDown.value = false;
        }
      } else {
        isScrollingDown.value = false;
      }
      scrollY.value = event.contentOffset.y;
    },
  });

  useEffect(() => {
    initializeStore().then(() => {
      fetchRepo();
    });
  }, []);

  const handleCommit = async () => {
    if (!isDeveloperMode) {
      Alert.alert('Authentication Required', 'Please configure your GitHub PAT in Settings to commit changes.', [
        { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
        { text: 'Cancel', style: 'cancel' }
      ]);
      return;
    }

    try {
      await commitChanges();
      Alert.alert('Success', 'Repository updated and pushed to GitHub successfully!');
    } catch (e: any) {
      Alert.alert('Commit Failed', e.message);
    }
  };

  const matchesCategory = useCallback((app: RepoApp, catId: string) => {
    if (catId === 'all') return true;
    const cat = (app.category || '').toLowerCase();
    const name = (app.name || '').toLowerCase();
    const desc = (app.subtitle || app.localizedDescription || '').toLowerCase();

    if (catId === 'sideloading') {
      return cat.includes('sideload') || cat.includes('sign') ||
        name.includes('sidestore') || name.includes('altstore') || name.includes('scarlet') ||
        name.includes('esign') || name.includes('feather') || name.includes('livecontainer') ||
        desc.includes('sideload') || desc.includes('sign ipa');
    }
    if (catId === 'games') return cat.includes('game') || name.includes('craft') || name.includes('amethyst') || name.includes('game') || desc.includes('game') || desc.includes('minecraft');
    if (catId === 'emu') return cat.includes('emu') || name.includes('dolphin') || name.includes('melon') || name.includes('ppsspp') || name.includes('psx') || name.includes('retro') || desc.includes('emulator');
    if (catId === 'social') return cat.includes('social') || name.includes('enswilde') || name.includes('3105') || desc.includes('social');
    if (catId === 'movies') return cat.includes('movie') || cat.includes('video') || cat.includes('media') || name.includes('movie') || desc.includes('stream') || desc.includes('video');
    if (catId === 'tools') {
      return cat.includes('tool') || cat.includes('utility') ||
        name.includes('filza') || name.includes('trollstore') || name.includes('cowabunga') ||
        name.includes('misaka') || name.includes('nugget') || desc.includes('utility') || desc.includes('tool');
    }

    return cat.includes(catId);
  }, []);

  const filteredApps = useMemo(() => {
    if (!repo?.apps) return [];
    return repo.apps.filter(app => {
      const matchesSearch =
        !searchQuery ||
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.bundleIdentifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.developerName && app.developerName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      return matchesCategory(app, selectedCategory);
    });
  }, [repo?.apps, selectedCategory, searchQuery, matchesCategory]);

  // Preserve a card's identity and fallback color when the filtered list changes.
  // This lets FlatList recycle unchanged rows instead of re-rendering them by position.
  const appIndexByBundle = useMemo(
    () => new Map(repo?.apps?.map((app, index) => [app.bundleIdentifier, index])),
    [repo?.apps]
  );

  const handleCategorySelect = useCallback((category: string) => {
    // SwiftUI can deliver a second press before React commits the first one.
    // Keep the source of truth in a ref so the same tab cannot queue duplicate
    // category changes or restart the header's glass state.
    if (category === selectedCategoryRef.current) return;
    selectedCategoryRef.current = category;
    setSelectedCategory(category);
  }, []);

  const renderDraggableItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<RepoApp>) => {
      const index = getIndex() ?? 0;
      return (
        <AppCard
          app={item}
          drag={selectedCategory === 'all' ? drag : NOOP}
          isActive={isActive}
          index={appIndexByBundle.get(item.bundleIdentifier) ?? index}
          onOpen={() => router.push({
            pathname: '/(tabs)/(apps)/[bundleIdentifier]',
            params: { bundleIdentifier: item.bundleIdentifier },
          })}
          onEdit={() => router.push({ pathname: '/edit', params: { bundleIdentifier: item.bundleIdentifier } })}
          onDuplicate={() => {
            if (repo) {
              const newApp = JSON.parse(JSON.stringify(item));
              newApp.bundleIdentifier = `${newApp.bundleIdentifier}.copy`;
              newApp.name = `${newApp.name} (Copy)`;
              useRepoStore.getState().duplicateApp(item.bundleIdentifier, newApp);
              void commitAfterChange(`${newApp.name} was added to repo.json.`);
            }
          }}
          onDelete={() => {
            Alert.alert('Delete App', `Are you sure you want to delete ${item.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  useRepoStore.getState().deleteApp(item.bundleIdentifier);
                  void commitAfterChange(`${item.name} was removed from repo.json.`);
                },
              },
            ]);
          }}
        />
      );
    },
    [appIndexByBundle, commitAfterChange, repo, router, selectedCategory]
  );

  const renderPlainItem = useCallback(
    ({ item, index }: { item: RepoApp; index: number }) => {
      return (
        <AppCard
          app={item}
          drag={NOOP}
          isActive={false}
          index={appIndexByBundle.get(item.bundleIdentifier) ?? index}
          onOpen={() => router.push({
            pathname: '/(tabs)/(apps)/[bundleIdentifier]',
            params: { bundleIdentifier: item.bundleIdentifier },
          })}
          onEdit={() => router.push({ pathname: '/edit', params: { bundleIdentifier: item.bundleIdentifier } })}
          onDuplicate={() => {}}
          onDelete={() => {}}
        />
      );
    },
    [appIndexByBundle, router]
  );

  const currentCategoryLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label || 'All Apps';

  const categoryTabs = useMemo(() => (
    <View>
      <AppCategoryTabs
        categories={CATEGORIES}
        selectedCategory={selectedCategory}
        onSelectCategory={handleCategorySelect}
        accentColor={ACCENT_COLORS[accentColor].value}
      />
      <Text
        selectable
        style={[styles.categoryCount, { color: theme.secondaryLabel }]}
      >
        {filteredApps.length} {filteredApps.length === 1 ? 'app' : 'apps'}
      </Text>
    </View>
  ), [accentColor, filteredApps.length, handleCategorySelect, selectedCategory, theme.secondaryLabel]);

  // NativeTabs floats above scrolling content. Reserve the visual tab bar and
  // home-indicator area so the final app card can scroll fully into view.
  const listContentStyle = useMemo(() => [
    styles.listContent,
    { paddingBottom: Math.max(170, safeAreaInsets.bottom + 136) },
  ], [safeAreaInsets.bottom]);

  const ListEmpty = () => {
    if (isLoading && !repo) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#0088FF" />
          <Text style={styles.loadingText}>Loading repository...</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchRepo} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry Fetch</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        {Platform.OS === 'ios' ? (
          <SymbolView name="tray" tintColor="#8E8E93" size={44} fallback="Inbox" />
        ) : (
          <Inbox size={40} color="#8E8E93" />
        )}
        <Text style={styles.emptyTitle}>No Apps in {currentCategoryLabel}</Text>
        <Text style={styles.emptySubtitle}>
          {isDeveloperMode
            ? 'Tap "+" in the bottom bar to add or upload an application to this category.'
            : 'There are currently no applications hosted under this category.'}
        </Text>
        <TouchableOpacity onPress={() => handleCategorySelect('all')} style={styles.showAllBtn} activeOpacity={0.8}>
          <Text style={styles.showAllBtnText}>Show All Apps ({repo?.apps?.length || 0})</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <>
      {isDeveloperMode ? (
        <DraggableFlatList
          containerStyle={[styles.list, { backgroundColor: theme.background }]}
          data={filteredApps}
          onDragEnd={({ data }) => {
            reorderApps(data);
            void commitAfterChange('The app order was saved to repo.json.');
          }}
          keyExtractor={item => item.bundleIdentifier}
          getItemLayout={getAppItemLayout}
          renderItem={renderDraggableItem}
          ListHeaderComponent={categoryTabs}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          initialNumToRender={7}
          maxToRenderPerBatch={7}
          updateCellsBatchingPeriod={16}
          windowSize={5}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      ) : (
        <Animated.FlatList
          style={[styles.list, { backgroundColor: theme.background }]}
          data={filteredApps}
          keyExtractor={(item: RepoApp) => item.bundleIdentifier}
          getItemLayout={getAppItemLayout}
          renderItem={renderPlainItem}
          ListHeaderComponent={categoryTabs}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={listContentStyle}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
          initialNumToRender={7}
          maxToRenderPerBatch={7}
          updateCellsBatchingPeriod={16}
          windowSize={5}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      )}
      <Stack.Toolbar key={`refresh-${toolbarThemeKey}`} placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="Refresh repository"
          icon="arrow.clockwise"
          onPress={fetchRepo}
        />
      </Stack.Toolbar>
      <Stack.Toolbar key={`actions-${toolbarThemeKey}`} placement="right">
        <Stack.Toolbar.Button icon="arrow.triangle.2.circlepath" onPress={fetchRepo} />
        <Stack.Toolbar.Button icon="externaldrive" onPress={handleCommit} />
      </Stack.Toolbar>
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  listContent: {
    paddingBottom: 170,
  },
  categoryCount: {
    marginLeft: 16,
    marginTop: -4,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 13.5,
    color: '#8E8E93',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  showAllBtn: {
    backgroundColor: '#0088FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
  },
  showAllBtnText: {
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 14,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
    fontWeight: '500',
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
