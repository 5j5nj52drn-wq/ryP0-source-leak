import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  Pressable,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  useAnimatedKeyboard,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { SymbolView } from 'expo-symbols';
import {
  Layers,
  Palette,
  PlusCircle,
  Settings,
  Search as SearchIcon,
  X,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRepoStore } from '../store/useRepoStore';

export function FloatingNavBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const keyboard = useAnimatedKeyboard();

  const { isSearchOpen, setIsSearchOpen, searchQuery, setSearchQuery } = useRepoStore();

  const isApps = pathname === '/' || pathname === '/(tabs)' || pathname === '/(tabs)/index';
  const isIcons = pathname.includes('/icons');
  const isAdd = pathname.includes('/add');
  const isSettings = pathname.includes('/settings');

  const triggerHaptic = (style: 'light' | 'medium' = 'light') => {
    try {
      Haptics?.impactAsync?.(
        style === 'light'
          ? Haptics.ImpactFeedbackStyle.Light
          : Haptics.ImpactFeedbackStyle.Medium
      )?.catch?.(() => {});
    } catch (e) {}
  };

  const handleTabPress = (route: string) => {
    triggerHaptic('light');
    if (isSearchOpen) {
      setIsSearchOpen(false);
      setSearchQuery('');
      Keyboard.dismiss();
    }
    router.navigate(route as any);
  };

  const handleOpenSearch = () => {
    triggerHaptic('medium');
    setIsSearchOpen(true);
    // If not on Apps tab, navigate to Apps tab so search results are visible
    if (!isApps) {
      router.navigate('/(tabs)');
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 150);
  };

  const handleCloseSearch = () => {
    triggerHaptic('light');
    Keyboard.dismiss();
    setSearchQuery('');
    setIsSearchOpen(false);
  };

  const animatedContainerStyle = useAnimatedStyle(() => {
    // Lift above keyboard smoothly when keyboard opens
    const keyboardOffset = keyboard.height.value > 0 ? -keyboard.height.value + (insets.bottom > 0 ? insets.bottom - 8 : 4) : 0;
    return {
      transform: [
        {
          translateY: withSpring(keyboardOffset, {
            damping: 24,
            stiffness: 280,
            mass: 0.8,
          }),
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.outerWrapper,
        { bottom: insets.bottom > 0 ? insets.bottom + 8 : 20 },
        animatedContainerStyle,
      ]}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={Platform.OS === 'ios' ? 95 : 100}
        tint="systemChromeMaterialDark"
        style={styles.blurCapsule}
      >
        <Animated.View layout={LinearTransition.springify().damping(22)} style={styles.innerContent}>
          {!isSearchOpen ? (
            /* ==========================================================
               NORMAL STATE: 4 Tab Icons + Search Button
               ========================================================== */
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={styles.tabsRow}
            >
              {/* Tab 1: Apps */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleTabPress('/(tabs)')}
                style={[styles.tabButton, isApps && styles.activeTabHighlight]}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView
                    name={isApps ? 'square.stack.3d.up.fill' : 'square.stack.3d.up'}
                    size={22}
                    tintColor={isApps ? '#007AFF' : '#8E8E93'}
                  />
                ) : (
                  <Layers size={22} color={isApps ? '#007AFF' : '#8E8E93'} />
                )}
                <Text style={[styles.tabLabel, isApps && styles.activeTabLabel]}>Apps</Text>
              </TouchableOpacity>

              {/* Tab 2: Icon Gallery */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleTabPress('/(tabs)/icons')}
                style={[styles.tabButton, isIcons && styles.activeTabHighlight]}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView
                    name={isIcons ? 'app.badge.fill' : 'app.badge'}
                    size={22}
                    tintColor={isIcons ? '#007AFF' : '#8E8E93'}
                  />
                ) : (
                  <Palette size={22} color={isIcons ? '#007AFF' : '#8E8E93'} />
                )}
                <Text style={[styles.tabLabel, isIcons && styles.activeTabLabel]}>Icons</Text>
              </TouchableOpacity>

              {/* Tab 3: Add App (Center) */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleTabPress('/(tabs)/add')}
                style={[styles.tabButton, isAdd && styles.activeTabHighlight]}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView
                    name={isAdd ? 'plus.circle.fill' : 'plus.circle'}
                    size={24}
                    tintColor={isAdd ? '#007AFF' : '#FFFFFF'}
                  />
                ) : (
                  <PlusCircle size={24} color={isAdd ? '#007AFF' : '#FFFFFF'} />
                )}
                <Text style={[styles.tabLabel, isAdd && styles.activeTabLabel, !isAdd && { color: '#FFFFFF', fontWeight: '600' }]}>
                  Add
                </Text>
              </TouchableOpacity>

              {/* Tab 4: Settings */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => handleTabPress('/(tabs)/settings')}
                style={[styles.tabButton, isSettings && styles.activeTabHighlight]}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView
                    name={isSettings ? 'gearshape.fill' : 'gearshape'}
                    size={22}
                    tintColor={isSettings ? '#007AFF' : '#8E8E93'}
                  />
                ) : (
                  <Settings size={22} color={isSettings ? '#007AFF' : '#8E8E93'} />
                )}
                <Text style={[styles.tabLabel, isSettings && styles.activeTabLabel]}>Settings</Text>
              </TouchableOpacity>

              {/* Subtle Vertical Divider */}
              <View style={styles.divider} />

              {/* Search Action Trigger */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleOpenSearch}
                style={styles.searchIconButton}
              >
                {Platform.OS === 'ios' ? (
                  <SymbolView name="magnifyingglass" size={21} tintColor="#FFFFFF" />
                ) : (
                  <SearchIcon size={21} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            </Animated.View>
          ) : (
            /* ==========================================================
               SEARCH ACTIVE STATE: Morph into full interactive search bar
               ========================================================== */
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(150)}
              style={styles.searchBarRow}
            >
              <View style={styles.searchInputContainer}>
                {Platform.OS === 'ios' ? (
                  <SymbolView name="magnifyingglass" size={18} tintColor="#8E8E93" style={styles.inputSearchIcon} />
                ) : (
                  <SearchIcon size={18} color="#8E8E93" style={styles.inputSearchIcon} />
                )}
                <TextInput
                  ref={inputRef}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search apps, bundle IDs..."
                  placeholderTextColor="#8E8E93"
                  style={styles.textInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {searchQuery.length > 0 && Platform.OS !== 'ios' && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
                    <X size={16} color="#8E8E93" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Cancel Button */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleCloseSearch}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </Animated.View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 9999,
  },
  blurCapsule: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 20,
    elevation: 15,
  },
  innerContent: {
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 22,
    marginHorizontal: 2,
  },
  activeTabHighlight: {
    backgroundColor: 'rgba(0, 122, 255, 0.16)',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#8E8E93',
    marginTop: 3,
  },
  activeTabLabel: {
    color: '#007AFF',
    fontWeight: '600',
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 4,
  },
  searchIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginLeft: 2,
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  inputSearchIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    paddingVertical: 0,
    fontWeight: '400',
  },
  clearButton: {
    padding: 4,
    marginLeft: 4,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 6,
  },
  cancelButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
