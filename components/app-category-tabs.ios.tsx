import React, { useCallback, useId, useRef } from 'react';
import { ColorValue } from 'react-native';
import { Host } from '@expo/ui';
import { Color } from 'expo-router';
import { Button, GlassEffectContainer, HStack, Namespace, ScrollView, useNativeState } from '@expo/ui/swift-ui';
import {
  buttonStyle,
  foregroundStyle,
  glassEffect,
  glassEffectId,
  id,
  onScrollPhaseChange,
  padding,
  scrollIndicators,
  scrollPosition,
  scrollTargetLayout,
} from '@expo/ui/swift-ui/modifiers';

export type AppCategory = {
  id: string;
  label: string;
};

type AppCategoryTabsProps = {
  categories: readonly AppCategory[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  accentColor?: ColorValue;
};

export default function AppCategoryTabs({
  categories,
  selectedCategory,
  onSelectCategory,
  accentColor = Color.ios.systemBlue,
}: AppCategoryTabsProps) {
  const namespaceId = useId();
  // A SwiftUI-backed scroll position survives React state changes. Without this
  // binding, changing the selected glass pill can make SwiftUI rebuild the
  // horizontal scroll view at its leading edge.
  const scrollAnchor = useNativeState<string | null>(null);
  const isScrollingRef = useRef(false);

  const handleScrollPhaseChange = useCallback((phase: 'idle' | 'tracking' | 'interacting' | 'animating' | 'decelerating') => {
    // Do not let the tail end of a horizontal swipe activate a category button.
    // This is a phase event, not a per-frame callback, so it stays off the hot path.
    isScrollingRef.current = phase !== 'idle';
  }, []);

  const selectCategory = useCallback((category: string) => {
    if (isScrollingRef.current || category === selectedCategory) return;
    onSelectCategory(category);
  }, [onSelectCategory, selectedCategory]);

  return (
    <Host style={{ height: 52, marginBottom: 12, width: '100%' }}>
      <Namespace id={namespaceId}>
        <ScrollView
          axes="horizontal"
          showsIndicators={false}
          modifiers={[
            scrollPosition(scrollAnchor, { anchor: 'leading' }),
            scrollIndicators('never', 'horizontal'),
            onScrollPhaseChange(handleScrollPhaseChange),
          ]}
        >
          <GlassEffectContainer spacing={8}>
            <HStack
              spacing={8}
              modifiers={[
                padding({ horizontal: 16, vertical: 6 }),
                scrollTargetLayout(),
              ]}
            >
              {categories.map((category) => {
                const selected = category.id === selectedCategory;
                return (
                  <Button
                    key={category.id}
                    label={category.label}
                    onPress={() => selectCategory(category.id)}
                    modifiers={[
                      buttonStyle('plain'),
                      foregroundStyle(selected ? '#FFFFFF' : Color.ios.label),
                      padding({ horizontal: 16, vertical: 9 }),
                      id(category.id),
                      glassEffect({
                        glass: {
                          variant: selected ? 'regular' : 'clear',
                          interactive: true,
                          tint: selected ? accentColor : undefined,
                        },
                        shape: 'capsule',
                      }),
                      ...(selected ? [glassEffectId('selected-category', namespaceId)] : []),
                    ]}
                  />
                );
              })}
            </HStack>
          </GlassEffectContainer>
        </ScrollView>
      </Namespace>
    </Host>
  );
}
