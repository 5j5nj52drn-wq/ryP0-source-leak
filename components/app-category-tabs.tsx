import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

export type AppCategory = {
  id: string;
  label: string;
};

type AppCategoryTabsProps = {
  categories: readonly AppCategory[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  accentColor?: string;
};

export default function AppCategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
  accentColor = '#007AFF',
}: AppCategoryTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {categories.map((category) => {
        const selected = category.id === selectedCategory;
        return (
          <Pressable
            key={category.id}
            onPress={() => onSelectCategory(category.id)}
            style={[styles.tab, selected && { backgroundColor: accentColor }]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>{category.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  tab: {
    alignItems: 'center',
    backgroundColor: '#E5E5EA',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
  },
  label: { color: '#3C3C43', fontSize: 12, fontWeight: '600' },
  selectedLabel: { color: '#FFFFFF' },
});
