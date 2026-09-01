import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  FlatList,
  Keyboard,
} from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { useAnimatedKeyboard, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useRepoStore } from '../../store/useRepoStore';
import { AppCard } from '../../components/AppCard';
import { RepoApp } from '../../types/repo';
import { Search as SearchIcon, X, RotateCw, Repeat, HardDrive, Inbox } from 'lucide-react-native';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CATEGORIES = [
  { id: 'all', label: 'Sideloading' },
  { id: 'games', label: 'Games' },
  { id: 'social', label: 'Soci...' },
  { id: 'emu', label: 'EMU' },
  { id: 'movies', label: 'Movies' },
];

export default function SearchScreen() {
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
    setSearchQuery,
  } = useRepoStore();

  const [selectedCategory, setSelectedCategory] = useState('all');
  const inputRef = useRef<TextInput>(null);

  // 120fps Native Keyboard Tracking
  const keyboard = useAnimatedKeyboard();

  const animatedBottomStyle = useAnimatedStyle(() => {
    // Sits directly above the Apple native tab bar
    const baseBottom = insets.bottom > 0 ? insets.bottom + 52 : 72;
    const keyboardHeight = keyboard.height.value;
    const finalBottom = keyboardHeight > 0 ? keyboardHeight + 8 : baseBottom;

    return {
      bottom: finalBottom,
    };
  });

  useEffect(() => {
    initializeStore();
    // Auto-focus search bar when entering search tab
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, []);

  const handleCommit = async () => {
    if (!githubToken) {
      Alert.alert('Authentication Required', 'Please configure your GitHub PAT in Settings to commit changes.', [
        { text: 'Settings', onPress: () => router.push('/(tabs)/settings') },
        { text: 'Cancel', style: 'cancel' },
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
    return repo.apps.filter((app) => {
      const matchesSearch =
        !searchQuery ||
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.bundleIdentifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (app.developerName && app.developerName.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchesSearch) return false;
      return matchesCategory(app, selectedCategory);
    });
  }, [repo?.apps, selectedCategory, searchQuery, matchesCategory]);

  const renderPlainItem = useCallback(
    ({ item, index }: { item: RepoApp; index: number }) => {
      return (
        <AppCard
          app={item}
          drag={() => {}}
          isActive={false}
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

  const ListHeader = () => (
    <View style={[styles.topHeaderContainer, { paddingTop: insets.top > 0 ? insets.top + 8 : 16 }]}>
      {/* Top Title & Actions Row */}
      <View style={styles.topTitleRow}>
        <View style={styles.titleColumn}>
          <Text style={styles.mainTitle}>ryP0</Text>
          <Text style={styles.subTitle}>SEARCH REPOSITORY</Text>
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
        {CATEGORIES.map((cat) => {
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
          <Text style={styles.loadingText}>Searching repository...</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        {Platform.OS === 'ios' ? (
          <SymbolView name="magnifyingglass" tintColor="#8E8E93" size={44} fallback="Search" />
        ) : (
          <SearchIcon size={40} color="#8E8E93" />
        )}
        <Text style={styles.emptyTitle}>
          {searchQuery.trim() ? `No apps matching "${searchQuery}"` : 'Type below to search apps'}
        </Text>
        <Text style={styles.emptySubtitle}>
          Filter by app name, bundle ID, or developer name in real time.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredApps}
        keyExtractor={(item) => item.bundleIdentifier}
        renderItem={renderPlainItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      />

      {/* Floating Interactive Search Bar directly above Navbar / Keyboard */}
      <Animated.View style={[styles.floatingSearchContainer, animatedBottomStyle]}>
        <View style={styles.searchPill}>
          <SearchIcon size={20} color="#007AFF" />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Search apps by name, bundle ID, developer..."
            placeholderTextColor="#8E8E93"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                inputRef.current?.focus();
              }}
              style={styles.clearBtn}
            >
              <X size={16} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topHeaderContainer: {
    marginBottom: 16,
  },
  topTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  titleColumn: {
    flexDirection: 'column',
  },
  mainTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },
  subTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1.2,
    marginTop: -2,
    textTransform: 'uppercase',
  },
  actionCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  actionBtn: {
    padding: 2,
  },
  categoriesCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 5,
    paddingVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  categoryItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 22,
  },
  activeCategoryItem: {
    backgroundColor: '#E6F4FE',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
  },
  activeCategoryText: {
    color: '#0088FF',
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: '#6B7280',
    fontWeight: '500',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  floatingSearchContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#000000',
    padding: 0,
  },
  clearBtn: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#E5E5EA',
  },
});
