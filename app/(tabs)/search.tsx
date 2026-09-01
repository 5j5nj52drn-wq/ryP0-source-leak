import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useRepoStore } from '../../store/useRepoStore';
import { AppCard } from '../../components/AppCard';
import { Search as SearchIcon, X, SlidersHorizontal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

const CATEGORIES = ['All', 'Sideloading', 'Games', 'Social', 'EMU', 'Movies'];

export default function SearchTabScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const repo = useRepoStore(state => state.repo);
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  const filteredApps = useMemo(() => {
    if (!repo?.apps) return [];
    return repo.apps.filter(app => {
      const matchesQuery =
        !query.trim() ||
        app.name.toLowerCase().includes(query.toLowerCase()) ||
        app.bundleIdentifier.toLowerCase().includes(query.toLowerCase()) ||
        (app.developerName && app.developerName.toLowerCase().includes(query.toLowerCase()));

      const matchesCat =
        selectedCategory === 'All' ||
        (app.category && app.category.toLowerCase() === selectedCategory.toLowerCase());

      return matchesQuery && matchesCat;
    });
  }, [repo?.apps, query, selectedCategory]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Search Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Search</Text>

        {/* Search Input Bar */}
        <View style={styles.searchBarWrapper}>
          <SearchIcon size={18} color="#8E8E93" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search apps, bundle IDs, developers..."
            placeholderTextColor="#8E8E93"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <X size={16} color="#8E8E93" />
            </TouchableOpacity>
          )}
        </View>

        {/* Categories Horizontal Pills */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.categoriesList}
          renderItem={({ item }) => {
            const isSelected = selectedCategory === item;
            return (
              <TouchableOpacity
                onPress={() => setSelectedCategory(item)}
                style={[styles.categoryPill, isSelected && styles.activeCategoryPill]}
              >
                <Text style={[styles.categoryText, isSelected && styles.activeCategoryText]}>
                  {item}
                </Text>
              </TouchableOpacity>
            );
          }}
        />
      </View>

      {/* Results Count & Apps List */}
      <FlatList
        data={filteredApps}
        keyExtractor={(item) => item.bundleIdentifier}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
        ListHeaderComponent={
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsCount}>
              {filteredApps.length} {filteredApps.length === 1 ? 'app found' : 'apps found'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <AppCard
            app={item}
            onEdit={() => router.push({ pathname: '/edit', params: { bundleIdentifier: item.bundleIdentifier } })}
            onDelete={() => {}}
            onDuplicate={() => {}}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <SearchIcon size={44} color="#C7C7CC" />
            <Text style={styles.emptyTitle}>No Apps Found</Text>
            <Text style={styles.emptySubtitle}>
              Try searching with a different term or category
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    backgroundColor: '#F2F2F7',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000000',
    marginBottom: 12,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(118, 118, 128, 0.12)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#000000',
    padding: 0,
  },
  categoriesList: {
    paddingTop: 12,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#E5E5EA',
  },
  activeCategoryPill: {
    backgroundColor: '#007AFF',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  activeCategoryText: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  resultsHeader: {
    marginBottom: 10,
  },
  resultsCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
  },
});
