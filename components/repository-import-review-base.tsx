import React, {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { BottomSheet } from '@expo/ui';
import { Image } from 'expo-image';
import type { RepoApp } from '../types/repo';
import RepositorySearchField from './repository-search-field';

export type RepositoryImportCategory = {
  id: string;
  label: string;
};

export type StagedRepositoryApp = {
  app: RepoApp;
  selected: boolean;
  category: string;
};

export type RepositoryImportReviewColors = {
  background: string;
  input: string;
  label: string;
  secondaryLabel: string;
  separator: string;
  surface: string;
};

export type RepositoryCategoryPickerProps = {
  accentColor: string;
  categories: readonly RepositoryImportCategory[];
  disabled: boolean;
  onChange: (category: string) => void;
  value: string;
};

export type RepositoryImportReviewProps = {
  accentColor: string;
  apps: readonly StagedRepositoryApp[];
  categories: readonly RepositoryImportCategory[];
  colors: RepositoryImportReviewColors;
  isPresented: boolean;
  isSaving: boolean;
  onDismiss: () => void;
  onMerge: () => void;
  onSetCategory: (bundleIdentifier: string, category: string) => void;
  onSetSelected: (bundleIdentifiers: readonly string[], selected: boolean) => void;
  onToggleSelected: (bundleIdentifier: string) => void;
};

type ReviewBaseProps = RepositoryImportReviewProps & {
  CategoryPicker: React.ComponentType<RepositoryCategoryPickerProps>;
};

type ReviewRowProps = {
  CategoryPicker: React.ComponentType<RepositoryCategoryPickerProps>;
  accentColor: string;
  categories: readonly RepositoryImportCategory[];
  colors: RepositoryImportReviewColors;
  disabled: boolean;
  item: StagedRepositoryApp;
  onSetCategory: (bundleIdentifier: string, category: string) => void;
  onToggleSelected: (bundleIdentifier: string) => void;
  rowHeight: number;
};

const ReviewRow = memo(function ReviewRow({
  CategoryPicker,
  accentColor,
  categories,
  colors,
  disabled,
  item,
  onSetCategory,
  onToggleSelected,
  rowHeight,
}: ReviewRowProps) {
  const bundleIdentifier = item.app.bundleIdentifier;
  const handleCategoryChange = useCallback((category: string) => {
    onSetCategory(bundleIdentifier, category);
  }, [bundleIdentifier, onSetCategory]);

  return (
    <View style={[styles.row, { borderColor: colors.separator, height: rowHeight }]}>
      <Pressable
        accessibilityLabel={`${item.selected ? 'Deselect' : 'Select'} ${item.app.name}`}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: item.selected, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => onToggleSelected(bundleIdentifier)}
        style={[
          styles.selectionBox,
          {
            backgroundColor: item.selected ? accentColor : 'transparent',
            borderColor: item.selected ? accentColor : colors.secondaryLabel,
          },
        ]}
      >
        <Text style={styles.selectionMark}>{item.selected ? '✓' : ''}</Text>
      </Pressable>
      <Image
        source={{ uri: item.app.iconURL }}
        style={styles.icon}
        contentFit="cover"
        recyclingKey={bundleIdentifier}
        transition={120}
      />
      <View style={styles.appInfo}>
        <Text selectable numberOfLines={1} style={[styles.appName, { color: colors.label }]}>
          {item.app.name}
        </Text>
        <Text selectable numberOfLines={1} style={[styles.appMetadata, { color: colors.secondaryLabel }]}>
          {item.app.developerName} · {bundleIdentifier}
        </Text>
        <View style={styles.categoryControl}>
          <CategoryPicker
            accentColor={accentColor}
            categories={categories}
            disabled={disabled || !item.selected}
            onChange={handleCategoryChange}
            value={item.category}
          />
        </View>
      </View>
    </View>
  );
});

export function RepositoryImportReviewBase({
  CategoryPicker,
  accentColor,
  apps,
  categories,
  colors,
  isPresented,
  isSaving,
  onDismiss,
  onMerge,
  onSetCategory,
  onSetSelected,
  onToggleSelected,
}: ReviewBaseProps) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const rowHeight = windowWidth < 380 ? 108 : 100;
  const sheetHeight = Math.max(300, Math.min(windowHeight - 48, 820));

  useEffect(() => {
    if (!isPresented) setQuery('');
  }, [isPresented]);

  const visibleApps = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase();
    if (!needle) return apps;
    return apps.filter(({ app, category }) => (
      app.name.toLocaleLowerCase().includes(needle) ||
      app.bundleIdentifier.toLocaleLowerCase().includes(needle) ||
      app.developerName.toLocaleLowerCase().includes(needle) ||
      category.toLocaleLowerCase().includes(needle)
    ));
  }, [apps, deferredQuery]);

  const selectedCount = useMemo(
    () => apps.reduce((count, item) => count + (item.selected ? 1 : 0), 0),
    [apps],
  );
  const selectedVisibleCount = useMemo(
    () => visibleApps.reduce((count, item) => count + (item.selected ? 1 : 0), 0),
    [visibleApps],
  );
  const visibleBundleIdentifiers = useMemo(
    () => visibleApps.map((item) => item.app.bundleIdentifier),
    [visibleApps],
  );

  const selectEveryVisibleApp = useCallback(() => {
    onSetSelected(visibleBundleIdentifiers, true);
  }, [onSetSelected, visibleBundleIdentifiers]);
  const clearEverySelectedApp = useCallback(() => {
    onSetSelected([], false);
  }, [onSetSelected]);

  const renderItem = useCallback(({ item }: ListRenderItemInfo<StagedRepositoryApp>) => (
    <ReviewRow
      CategoryPicker={CategoryPicker}
      accentColor={accentColor}
      categories={categories}
      colors={colors}
      disabled={isSaving}
      item={item}
      onSetCategory={onSetCategory}
      onToggleSelected={onToggleSelected}
      rowHeight={rowHeight}
    />
  ), [CategoryPicker, accentColor, categories, colors, isSaving, onSetCategory, onToggleSelected, rowHeight]);

  const keyExtractor = useCallback(
    (item: StagedRepositoryApp) => item.app.bundleIdentifier,
    [],
  );
  const getItemLayout = useCallback((_data: ArrayLike<StagedRepositoryApp> | null | undefined, index: number) => ({
    index,
    length: rowHeight,
    offset: rowHeight * index,
  }), [rowHeight]);

  return (
    <BottomSheet
      isPresented={isPresented}
      onDismiss={onDismiss}
      snapPoints={['full']}
      contentPadding={0}
      containerColor={colors.background}
      testID="repository-import-review"
    >
      <View style={[styles.sheet, { backgroundColor: colors.background, height: sheetHeight }]}>
        <View style={styles.centeredContent}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text selectable style={[styles.title, { color: colors.label }]}>Review Repository Apps</Text>
              <Text selectable style={[styles.subtitle, { color: colors.secondaryLabel }]}>
                {selectedCount} selected of {apps.length} · {visibleApps.length} shown
              </Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSaving}
              onPress={onDismiss}
              style={[styles.closeButton, { borderColor: colors.separator }]}
            >
              <Text style={[styles.closeButtonText, { color: colors.label }]}>Done</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <RepositorySearchField value={query} onChangeText={setQuery} />
          </View>

          <View style={styles.selectionToolbar}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSaving || !visibleApps.length || selectedVisibleCount === visibleApps.length}
              onPress={selectEveryVisibleApp}
              style={styles.toolbarButton}
            >
              <Text style={[styles.toolbarButtonText, { color: accentColor }]}>Select Shown</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSaving || !selectedCount}
              onPress={clearEverySelectedApp}
              style={styles.toolbarButton}
            >
              <Text style={[styles.toolbarButtonText, { color: accentColor }]}>Clear Selection</Text>
            </TouchableOpacity>
          </View>
        </View>

        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          data={visibleApps as StagedRepositoryApp[]}
          extraData={isSaving}
          getItemLayout={getItemLayout}
          initialNumToRender={10}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={keyExtractor}
          maxToRenderPerBatch={12}
          removeClippedSubviews={false}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,
            { maxWidth: 760, width: '100%', alignSelf: 'center' },
            !visibleApps.length && styles.emptyListContent,
          ]}
          updateCellsBatchingPeriod={40}
          windowSize={9}
          ListEmptyComponent={(
            <Text selectable style={[styles.emptyText, { color: colors.secondaryLabel }]}>
              No extracted apps match that search.
            </Text>
          )}
        />

        <View style={[styles.footer, { borderColor: colors.separator, backgroundColor: colors.background }]}>
          <View style={styles.centeredContent}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={!selectedCount || isSaving}
              onPress={onMerge}
              style={[
                styles.mergeButton,
                { backgroundColor: accentColor, opacity: !selectedCount || isSaving ? 0.5 : 1 },
              ]}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.mergeButtonText}>
                  Merge {selectedCount} Selected {selectedCount === 1 ? 'App' : 'Apps'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { minHeight: 300, width: '100%' },
  centeredContent: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingBottom: 10, paddingHorizontal: 18, paddingTop: 8 },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 12, fontVariant: ['tabular-nums'], marginTop: 3 },
  closeButton: { alignItems: 'center', borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, justifyContent: 'center', minHeight: 36, paddingHorizontal: 13 },
  closeButtonText: { fontSize: 13, fontWeight: '600' },
  searchContainer: { paddingHorizontal: 18 },
  selectionToolbar: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', minHeight: 40, paddingHorizontal: 18 },
  toolbarButton: { justifyContent: 'center', minHeight: 40 },
  toolbarButtonText: { fontSize: 12, fontWeight: '700' },
  list: { flex: 1, width: '100%' },
  listContent: { paddingHorizontal: 18 },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, width: '100%' },
  selectionBox: { alignItems: 'center', borderRadius: 8, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  selectionMark: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  icon: { backgroundColor: 'rgba(120, 120, 128, 0.16)', borderCurve: 'continuous', borderRadius: 11, height: 48, width: 48 },
  appInfo: { flex: 1, minWidth: 0 },
  appName: { fontSize: 15, fontWeight: '700' },
  appMetadata: { fontSize: 11, marginTop: 2 },
  categoryControl: { alignItems: 'flex-start', height: 36, justifyContent: 'center', marginTop: 3, maxWidth: '100%' },
  emptyText: { fontSize: 14, paddingHorizontal: 18, paddingVertical: 30, textAlign: 'center' },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 16, paddingHorizontal: 18, paddingTop: 10 },
  mergeButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 50, width: '100%' },
  mergeButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
