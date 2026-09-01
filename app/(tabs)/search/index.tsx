import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  FlatList,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useRepoStore } from '../../../store/useRepoStore';
import { AppCard } from '../../../components/AppCard';
import { RepoApp } from '../../../types/repo';
import { RotateCw, HardDrive } from 'lucide-react-native';
import { SymbolView } from 'expo-symbols';

const CATEGORIES = [
  { id: 'all', label: 'Sideloading' },
  { id: 'games', label: 'Games' },
  { id: 'social', label: 'Social' },
  { id: 'emu', label: 'EMU' },
  { id: 'movies', label: 'Movies' },
];

export default function SearchScreen() {
  const router = useRouter();
  const {
    repo,
    isLoading,
    fetchRepo,
    commitChanges,
    githubToken,
    initializeStore,
    searchQuery,
    setSearchQuery,
  } = useRepoStore();

  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    initializeStore();
  }, []);

  const handleCommit = async () => {
    if (!githubToken) {
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

    if (catId === 'games') return cat.includes('game') || name.includes('craft');
    if (catId === 'emu') return cat.includes('emu') || name.includes('dolphin');
    if (catId === 'social') return cat.includes('social') || desc.includes('social');
    if (catId === 'movies') return cat.includes('movie') || cat.includes('video');

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

  const renderPlainItem = useCallback(
    ({ item, index }: { item: RepoApp; index: number }) => (
      <AppCard
        app={item}
        drag={() => {}}
        isActive={false}
        index={index}
        onEdit={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
      />
    ),
    [repo]
  );

  const ListHeader = () => (
    <View style={styles.topHeaderContainer}>
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
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Search',
          headerLargeTitle: true,
          headerTransparent: Platform.OS === 'ios',
          headerBlurEffect: 'regular',
          headerSearchBarOptions: {
            placeholder: 'Search apps, bundle IDs...',
            onChangeText: (event) => setSearchQuery(event.nativeEvent.text),
            onCancelButtonPress: () => setSearchQuery(''),
            hideWhenScrolling: false,
            capitalize: 'none',
          },
        }}
      />

      <FlatList
        style={styles.container}
        data={filteredApps}
        keyExtractor={(item) => item.bundleIdentifier}
        renderItem={renderPlainItem}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  listContent: { paddingHorizontal: 16, paddingTop: 16 },
  topHeaderContainer: { marginBottom: 16 },
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
  categoryItem: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 22 },
  activeCategoryItem: { backgroundColor: '#E6F4FE' },
  categoryText: { fontSize: 13, fontWeight: '600', color: '#111827' },
  activeCategoryText: { color: '#0088FF', fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 12 },
  loadingText: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' },
});
