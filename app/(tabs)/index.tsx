import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  ScrollView,
  Platform,
  FlatList,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedScrollHandler } from 'react-native-reanimated';
import { useRouter, Stack } from 'expo-router';
import { useRepoStore } from '../../store/useRepoStore';
import { isScrollingDown, scrollY } from '../../store/sharedScroll';
import { AppCard } from '../../components/AppCard';
import { RepoApp } from '../../types/repo';
import { Plus, RotateCw, Save, Inbox, RefreshCw, HardDrive, Repeat } from 'lucide-react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORIES = [
  { id: 'all', label: 'Sideloading' },
  { id: 'games', label: 'Games' },
  { id: 'social', label: 'Soci...' },
  { id: 'emu', label: 'EMU' },
  { id: 'movies', label: 'Movies' },
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    repo,
    isLoading,
    error,
    fetchRepo,
    reorderApps,
    commitChanges,
    githubToken,
    isDeveloperMode,
    initializeStore,
    searchQuery,
  } = useRepoStore();

  const [selectedCategory, setSelectedCategory] = useState('all');

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
    if (!githubToken) {
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

    if (catId === 'games') return cat.includes('game') || name.includes('craft') || name.includes('amethyst') || name.includes('game') || desc.includes('game') || desc.includes('minecraft');
    if (catId === 'emu') return cat.includes('emu') || name.includes('dolphin') || name.includes('melon') || name.includes('ppsspp') || name.includes('psx') || name.includes('retro') || desc.includes('emulator');
    if (catId === 'social') return cat.includes('social') || name.includes('enswilde') || name.includes('3105') || desc.includes('social') || desc.includes('tool');
    if (catId === 'movies') return cat.includes('movie') || cat.includes('video') || cat.includes('media') || name.includes('movie') || desc.includes('stream') || desc.includes('video');

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

  const renderDraggableItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<RepoApp>) => {
      const index = getIndex() ?? 0;
      return (
        <AppCard
          app={item}
          drag={drag}
          isActive={isActive}
          index={index}
          onEdit={() => router.push({ pathname: '/edit', params: { bundleIdentifier: item.bundleIdentifier } })}
          onDuplicate={() => {
            if (repo) {
              const newApp = JSON.parse(JSON.stringify(item));
              newApp.bundleIdentifier = `${newApp.bundleIdentifier}.copy`;
              newApp.name = `${newApp.name} (Copy)`;
              useRepoStore.getState().duplicateApp(item.bundleIdentifier, newApp);
            }
          }}
          onDelete={() => {
            Alert.alert('Delete App', `Are you sure you want to delete ${item.name}?`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => useRepoStore.getState().deleteApp(item.bundleIdentifier) },
            ]);
          }}
        />
      );
    },
    [repo]
  );

  const renderPlainItem = useCallback(
    ({ item, index }: { item: RepoApp; index: number }) => {
      return (
        <AppCard
          app={item}
          drag={() => { }}
          isActive={false}
          index={index}
          onEdit={() => router.push({ pathname: '/edit', params: { bundleIdentifier: item.bundleIdentifier } })}
          onDuplicate={() => { }}
          onDelete={() => { }}
        />
      );
    },
    []
  );

  const currentCategoryLabel = CATEGORIES.find(c => c.id === selectedCategory)?.label || 'All';

  const ListHeader = () => (
    <View style={[styles.topHeaderContainer, { paddingTop: insets.top > 0 ? insets.top + 8 : 16 }]}>
      {/* Top Title & Actions Row */}
      <View style={styles.topTitleRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.mainTitle}>ryP0</Text>
          <Text style={styles.subTitle}>ULTIMATE SOURSE</Text>
        </View>

        {/* Right Floating Actions Capsule */}
        <View style={styles.actionCapsule}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => fetchRepo()}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <RotateCw size={19} color="#111827" strokeWidth={2.4} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => fetchRepo()}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Repeat size={19} color="#111827" strokeWidth={2.4} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleCommit}
            style={styles.actionBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <HardDrive size={19} color="#111827" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Categories Horizontal Capsule */}
      <View style={styles.categoriesCapsule}>
        {CATEGORIES.map(cat => {
          const isSelected = selectedCategory === cat.id;
          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.7}
              onPress={() => setSelectedCategory(cat.id)}
              style={[styles.categoryItem, isSelected && styles.activeCategoryItem]}
            >
              <Text style={[styles.categoryText, isSelected && styles.activeCategoryText]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

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
        <TouchableOpacity onPress={() => setSelectedCategory('all')} style={styles.showAllBtn} activeOpacity={0.8}>
          <Text style={styles.showAllBtnText}>Show All Apps ({repo?.apps?.length || 0})</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {selectedCategory === 'all' && isDeveloperMode ? (
        <DraggableFlatList
          data={filteredApps}
          onDragEnd={({ data }) => reorderApps(data)}
          keyExtractor={item => item.bundleIdentifier}
          renderItem={renderDraggableItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      ) : (
        <Animated.FlatList
          data={filteredApps}
          keyExtractor={(item: RepoApp) => item.bundleIdentifier}
          renderItem={renderPlainItem}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          onScroll={scrollHandler}
          scrollEventThrottle={16}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  topHeaderContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  topTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleColumn: {
    justifyContent: 'center',
  },
  mainTitle: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 34,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subTitle: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  actionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  actionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoriesCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 24,
    padding: 3,
    marginTop: 16,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  categoryItem: {
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCategoryItem: {
    backgroundColor: 'rgba(0, 136, 255, 0.12)',
    paddingHorizontal: 12,
  },
  categoryText: {
    fontFamily: Platform.OS === 'ios' ? 'SF Pro' : 'System',
    fontSize: 12.5,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  activeCategoryText: {
    color: '#0088FF',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 110,
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
