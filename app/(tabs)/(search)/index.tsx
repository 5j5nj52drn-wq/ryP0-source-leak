import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useRepoStore } from '../../../store/useRepoStore';
import { useShallow } from 'zustand/react/shallow';
import { AppCard } from '../../../components/AppCard';
import { APP_CARD_HEIGHT } from '../../../components/app-card-visual.types';
import AppCategoryTabs from '../../../components/app-category-tabs';
import { RepoApp } from '../../../types/repo';
import { RotateCw } from 'lucide-react-native';
import { SymbolView } from 'expo-symbols';
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

export default function SearchScreen() {
  const router = useRouter();
  const {
    repo,
    isLoading,
    fetchRepo,
    commitChanges,
    isDeveloperMode,
    initializeStore,
    searchQuery,
    setSearchQuery,
    accentColor,
  } = useRepoStore(useShallow((state) => ({
    repo: state.repo,
    isLoading: state.isLoading,
    fetchRepo: state.fetchRepo,
    commitChanges: state.commitChanges,
    isDeveloperMode: state.isDeveloperMode,
    initializeStore: state.initializeStore,
    searchQuery: state.searchQuery,
    setSearchQuery: state.setSearchQuery,
    accentColor: state.accentColor,
  })));
  const theme = useAppTheme();

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
      Alert.alert('Could Not Save to GitHub', error?.message || 'The change has not been committed.');
    }
  }, [commitChanges]);

  useEffect(() => {
    initializeStore();
  }, []);

  const handleCommit = async () => {
    if (!isDeveloperMode) {
      Alert.alert('Auth Required', 'Please configure your GitHub PAT in Settings.');
      return;
    }
    try {
      await commitChanges();
      Alert.alert('Success', 'Repository updated and pushed to GitHub!');
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
    if (catId === 'games') return cat.includes('game') || name.includes('craft');
    if (catId === 'emu') return cat.includes('emu') || name.includes('dolphin');
    if (catId === 'social') return cat.includes('social') || desc.includes('social');
    if (catId === 'movies') return cat.includes('movie') || cat.includes('video');
    if (catId === 'tools') {
      return cat.includes('tool') || cat.includes('utility') ||
        name.includes('filza') || name.includes('trollstore') || name.includes('cowabunga') ||
        name.includes('misaka') || name.includes('nugget') || desc.includes('utility') || desc.includes('tool');
    }

    return cat.includes(catId);
  }, []);

  const filteredApps = useMemo(() => {
    if (!repo?.apps) return [];
    return repo.apps.filter((app) => {
      const matchesSearch =
        !searchQuery ||
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.bundleIdentifier.toLowerCase().includes(searchQuery.toLowerCase());

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
    if (category === selectedCategoryRef.current) return;
    selectedCategoryRef.current = category;
    setSelectedCategory(category);
  }, []);

  const renderPlainItem = useCallback(
    ({ item, index }: { item: RepoApp; index: number }) => (
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
        onDuplicate={() => {
          if (!repo) return;
          const newApp = JSON.parse(JSON.stringify(item));
          newApp.bundleIdentifier = `${newApp.bundleIdentifier}.copy`;
          newApp.name = `${newApp.name} (Copy)`;
          useRepoStore.getState().duplicateApp(item.bundleIdentifier, newApp);
          void commitAfterChange(`${newApp.name} was added to repo.json.`);
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
    ),
    [appIndexByBundle, commitAfterChange, repo, router]
  );

  const categoryTabs = useMemo(() => (
    <View style={styles.listHeader}>
      <AppCategoryTabs
        categories={CATEGORIES}
        selectedCategory={selectedCategory}
        onSelectCategory={handleCategorySelect}
        accentColor={ACCENT_COLORS[accentColor].value}
      />
    </View>
  ), [accentColor, handleCategorySelect, selectedCategory]);

  const ListEmpty = () => {
    if (isLoading && !repo) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color="#0088FF" />
          <Text style={styles.loadingText}>Searching repository...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        {Platform.OS === 'ios' ? (
          <SymbolView name="magnifyingglass" tintColor="#8E8E93" size={44} />
        ) : (
          <RotateCw size={40} color="#8E8E93" />
        )}
        <Text style={styles.emptyTitle}>
          {searchQuery.trim() ? `No apps matching "${searchQuery}"` : 'Search your repository'}
        </Text>
      </View>
    );
  };

  return (
    <>
      <FlatList
        style={[styles.container, { backgroundColor: theme.background }]}
        data={filteredApps}
        keyExtractor={(item) => item.bundleIdentifier}
        getItemLayout={getAppItemLayout}
        renderItem={renderPlainItem}
        ListHeaderComponent={categoryTabs}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        initialNumToRender={7}
        maxToRenderPerBatch={7}
        updateCellsBatchingPeriod={16}
        windowSize={5}
        keyboardDismissMode="on-drag"
      />
      <Stack.SearchBar
        placeholder="Search apps"
        onChangeText={(event) => setSearchQuery(event.nativeEvent.text)}
        onCancelButtonPress={() => setSearchQuery('')}
      />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="arrow.clockwise" onPress={fetchRepo} />
        <Stack.Toolbar.Button icon="arrow.triangle.2.circlepath" onPress={fetchRepo} />
        <Stack.Toolbar.Button icon="externaldrive" onPress={handleCommit} />
      </Stack.Toolbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  listContent: { paddingBottom: 100 },
  listHeader: { marginBottom: 2 },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
});
