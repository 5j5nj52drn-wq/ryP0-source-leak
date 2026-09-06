import React, { useId } from 'react';
import { ColorValue } from 'react-native';
import { Host } from '@expo/ui';
import { Color } from 'expo-router';
import { Button, GlassEffectContainer, HStack, Namespace, ScrollView } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  buttonStyle,
  foregroundStyle,
  glassEffect,
  glassEffectId,
  padding,
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
  const selectedIndex = Math.max(0, categories.findIndex((category) => category.id === selectedCategory));

  return (
    <Host style={{ height: 52, marginBottom: 12, width: '100%' }}>
      <Namespace id={namespaceId}>
        <ScrollView axes="horizontal" showsIndicators={false}>
          <GlassEffectContainer spacing={8}>
            <HStack
              spacing={8}
              modifiers={[
                padding({ horizontal: 16, vertical: 6 }),
                animation(Animation.spring({ response: 0.32, dampingFraction: 0.82 }), selectedIndex),
              ]}
            >
              {categories.map((category) => {
                const selected = category.id === selectedCategory;
                return (
                  <Button
                    key={category.id}
                    label={category.label}
                    onPress={() => onSelectCategory(category.id)}
                    modifiers={[
                      buttonStyle('plain'),
                      foregroundStyle(selected ? '#FFFFFF' : Color.ios.label),
                      padding({ horizontal: 16, vertical: 9 }),
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
