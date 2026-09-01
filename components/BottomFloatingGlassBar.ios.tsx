import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Host } from '@expo/ui';
import {
  HStack,
  VStack,
  ZStack,
  Button,
  Image,
  Text,
  TextField,
  GlassEffectContainer,
} from '@expo/ui/swift-ui';
import {
  glassEffect,
  frame,
  shadow,
  padding,
  cornerRadius,
  buttonStyle,
  font,
  foregroundColor,
} from '@expo/ui/swift-ui/modifiers';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { isScrollingDown } from '../store/sharedScroll';
import { useRepoStore } from '../store/useRepoStore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function BottomFloatingGlassBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useRepoStore();

  const isAppsActive =
    pathname === '/' ||
    pathname === '/(tabs)' ||
    pathname === '/(tabs)/index' ||
    (!pathname.includes('icons') && !pathname.includes('settings') && !pathname.includes('add') && !pathname.includes('edit'));
  const isIconsActive = pathname.includes('icons');
  const isSettingsActive = pathname.includes('settings');

  const triggerHaptic = async (style: string = 'light') => {
    if (Platform.OS === 'ios') {
      try {
        const Haptics = require('expo-haptics');
        await Haptics.impactAsync(
          style === 'light'
            ? Haptics.ImpactFeedbackStyle.Light
            : Haptics.ImpactFeedbackStyle.Medium
        );
      } catch (e) {}
    }
  };

  const handleTabPress = (tab: string) => {
    triggerHaptic('light');
    if (tab === 'apps') {
      router.navigate('/(tabs)');
    } else if (tab === 'upload') {
      triggerHaptic('medium');
      router.push('/add');
    } else if (tab === 'icons') {
      router.navigate('/(tabs)/icons');
    } else if (tab === 'settings') {
      router.navigate('/(tabs)/settings');
    }
  };

  const handleSearchToggle = () => {
    triggerHaptic('medium');
    if (isSearchOpen) {
      setSearchQuery('');
      setIsSearchOpen(false);
    } else {
      setIsSearchOpen(true);
      if (!isAppsActive) {
        router.navigate('/(tabs)');
      }
    }
  };

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withSpring(isScrollingDown.value && !isSearchOpen ? 120 : 0, {
            damping: 24,
            stiffness: 250,
          }),
        },
      ],
      opacity: withSpring(isScrollingDown.value && !isSearchOpen ? 0 : 1, {
        damping: 24,
        stiffness: 250,
      }),
    };
  });

  return (
    <Animated.View
      style={[
        styles.outerContainer,
        { bottom: insets.bottom > 0 ? insets.bottom - 4 : 12 },
        animatedStyle,
      ]}
      pointerEvents="box-none"
    >
      <Host matchContents style={styles.hostContainer}>
        <GlassEffectContainer spacing={10}>
          <HStack spacing={10}>
            {/* Main Swift/SwiftUI Liquid Glass Capsule */}
            <ZStack
              modifiers={[
                frame({ height: 64 }),
                glassEffect({
                  glass: { variant: 'regular', interactive: true },
                  shape: 'capsule',
                }),
                shadow({ radius: 24, y: 10, color: 'rgba(0,0,0,0.35)' }),
                padding({ leading: 6, trailing: 6 }),
              ]}
            >
              {isSearchOpen ? (
                /* Native SwiftUI Search Input */
                <HStack spacing={8} modifiers={[padding({ leading: 14, trailing: 14 })]}>
                  <Image
                    systemName="magnifyingglass"
                    size={18}
                    color="#4CB5FF"
                  />
                  <TextField
                    placeholder="Search apps by name, ID..."
                    onTextChange={(text) => setSearchQuery(text)}
                    modifiers={[
                      frame({ minWidth: 230, height: 46 }),
                    ]}
                  />
                </HStack>
              ) : (
                /* Native SwiftUI Tab Buttons */
                <HStack spacing={4}>
                  {/* Tab 1: Apps */}
                  <Button
                    onPress={() => handleTabPress('apps')}
                    modifiers={[
                      buttonStyle('plain'),
                      frame({ width: 70, height: 54 }),
                      cornerRadius(27),
                      ...(isAppsActive
                        ? [
                            glassEffect({
                              glass: {
                                variant: 'clear',
                                interactive: true,
                                tint: 'rgba(76, 181, 255, 0.25)',
                              },
                              shape: 'capsule',
                            }),
                          ]
                        : []),
                    ]}
                  >
                    <VStack spacing={3}>
                      <Image
                        systemName="square.stack.3d.up.fill"
                        size={20}
                        color={isAppsActive ? '#4CB5FF' : '#FFFFFF'}
                      />
                      <Text
                        modifiers={[
                          font({ size: 10.5, weight: isAppsActive ? 'bold' : 'medium' }),
                          foregroundColor(isAppsActive ? '#4CB5FF' : '#FFFFFF'),
                        ]}
                      >
                        Apps
                      </Text>
                    </VStack>
                  </Button>

                  {/* Tab 2: Add */}
                  <Button
                    onPress={() => handleTabPress('upload')}
                    modifiers={[
                      buttonStyle('plain'),
                      frame({ width: 70, height: 54 }),
                      cornerRadius(27),
                    ]}
                  >
                    <VStack spacing={3}>
                      <Image
                        systemName="plus.circle.fill"
                        size={20}
                        color="#FFFFFF"
                      />
                      <Text
                        modifiers={[
                          font({ size: 10.5, weight: 'medium' }),
                          foregroundColor('#FFFFFF'),
                        ]}
                      >
                        Add
                      </Text>
                    </VStack>
                  </Button>

                  {/* Tab 3: Icons */}
                  <Button
                    onPress={() => handleTabPress('icons')}
                    modifiers={[
                      buttonStyle('plain'),
                      frame({ width: 70, height: 54 }),
                      cornerRadius(27),
                      ...(isIconsActive
                        ? [
                            glassEffect({
                              glass: {
                                variant: 'clear',
                                interactive: true,
                                tint: 'rgba(76, 181, 255, 0.25)',
                              },
                              shape: 'capsule',
                            }),
                          ]
                        : []),
                    ]}
                  >
                    <VStack spacing={3}>
                      <Image
                        systemName="app.badge.fill"
                        size={20}
                        color={isIconsActive ? '#4CB5FF' : '#FFFFFF'}
                      />
                      <Text
                        modifiers={[
                          font({ size: 10.5, weight: isIconsActive ? 'bold' : 'medium' }),
                          foregroundColor(isIconsActive ? '#4CB5FF' : '#FFFFFF'),
                        ]}
                      >
                        Icons
                      </Text>
                    </VStack>
                  </Button>

                  {/* Tab 4: Settings */}
                  <Button
                    onPress={() => handleTabPress('settings')}
                    modifiers={[
                      buttonStyle('plain'),
                      frame({ width: 70, height: 54 }),
                      cornerRadius(27),
                      ...(isSettingsActive
                        ? [
                            glassEffect({
                              glass: {
                                variant: 'clear',
                                interactive: true,
                                tint: 'rgba(76, 181, 255, 0.25)',
                              },
                              shape: 'capsule',
                            }),
                          ]
                        : []),
                    ]}
                  >
                    <VStack spacing={3}>
                      <Image
                        systemName="gearshape.fill"
                        size={20}
                        color={isSettingsActive ? '#4CB5FF' : '#FFFFFF'}
                      />
                      <Text
                        modifiers={[
                          font({ size: 10.5, weight: isSettingsActive ? 'bold' : 'medium' }),
                          foregroundColor(isSettingsActive ? '#4CB5FF' : '#FFFFFF'),
                        ]}
                      >
                        Settings
                      </Text>
                    </VStack>
                  </Button>
                </HStack>
              )}
            </ZStack>

            {/* Right Swift/SwiftUI Liquid Glass Search Circle */}
            <Button
              onPress={handleSearchToggle}
              modifiers={[
                buttonStyle('plain'),
                frame({ width: 64, height: 64 }),
                glassEffect({
                  glass: {
                    variant: 'regular',
                    interactive: true,
                    ...(isSearchOpen ? { tint: 'rgba(76, 181, 255, 0.3)' } : {}),
                  },
                  shape: 'circle',
                }),
                shadow({ radius: 24, y: 10, color: 'rgba(0,0,0,0.35)' }),
              ]}
            >
              <Image
                systemName={isSearchOpen ? 'xmark' : 'magnifyingglass'}
                size={22}
                color={isSearchOpen ? '#4CB5FF' : '#FFFFFF'}
              />
            </Button>
          </HStack>
        </GlassEffectContainer>
      </Host>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    zIndex: 999,
  },
  hostContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 76,
  },
});
