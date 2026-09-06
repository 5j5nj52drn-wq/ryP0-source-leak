import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  ActivityIndicator,
  Alert,
  View,
  Text,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { GithubFile, useRepoStore } from '../../../store/useRepoStore';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { File, Paths } from 'expo-file-system';
import { MenuView } from '@expo/ui/community/menu';
import { useAppTheme } from '../../../theme/app-preferences';

const ICON_COLUMNS = 3;
const ICON_GAP = 12;
const HORIZONTAL_PADDING = 16;
const APP_ICON_RADIUS_RATIO = 0.223;

export default function IconsGalleryScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const iconsList = useRepoStore(state => state.iconsList);
  const fetchIcons = useRepoStore(state => state.fetchIcons);
  const uploadIcon = useRepoStore(state => state.uploadIcon);
  const isLoading = useRepoStore(state => state.isLoading);
  const isDeveloperMode = useRepoStore(state => state.isDeveloperMode);
  const setPendingIconSelection = useRepoStore(state => state.setPendingIconSelection);
  const theme = useAppTheme();
  const { width } = useWindowDimensions();

  const [uploading, setUploading] = useState(false);

  const iconSize = useMemo(
    () => Math.floor((width - HORIZONTAL_PADDING * 2 - ICON_GAP * (ICON_COLUMNS - 1)) / ICON_COLUMNS),
    [width]
  );
  const iconRadius = useMemo(() => Math.round(iconSize * APP_ICON_RADIUS_RATIO), [iconSize]);

  useEffect(() => {
    fetchIcons();
  }, []);

  const handleUpload = async () => {
    if (!isDeveloperMode) {
      Alert.alert('Developer Access Required', 'Only the repository administrator can upload icons.');
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setUploading(true);
        // Generate a random filename
        const filename = `${Date.now()}-icon.png`;
        const newUrl = await uploadIcon(result.assets[0].base64, filename);

        // If in select mode, automatically select the newly uploaded icon
        if (mode === 'select') {
          setPendingIconSelection(newUrl);
          router.back();
        }
      }
    } catch (e: any) {
      Alert.alert('Upload Failed', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSelect = useCallback((url: string) => {
    if (mode === 'select') {
      setPendingIconSelection(url);
      router.back();
    }
  }, [mode, router, setPendingIconSelection]);

  const handleSaveIcon = useCallback(async (item: GithubFile) => {
    try {
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (!permission.granted) {
        Alert.alert('Photos Access Needed', 'Allow photo-library access to save this icon.');
        return;
      }

      const extension = item.name.split('.').pop()?.toLowerCase().match(/^(png|jpe?g|gif|webp)$/)
        ? item.name.split('.').pop()!.toLowerCase()
        : 'png';
      const safeName = item.name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/\.[^.]+$/, '');
      const destination = new File(Paths.cache, `ryp0-${Date.now()}-${safeName}.${extension}`);
      const savedFile = await File.downloadFileAsync(item.download_url, destination);
      await MediaLibrary.saveToLibraryAsync(savedFile.uri);
      Alert.alert('Icon Saved', `${item.name} was saved to your photo library.`);
    } catch (error: any) {
      Alert.alert('Could Not Save Icon', error?.message || 'The icon could not be saved to Photos.');
    }
  }, []);

  const handleCopyIconLink = useCallback(async (item: GithubFile) => {
    try {
      const Clipboard = await import('expo-clipboard');
      await Clipboard.setStringAsync(item.download_url);
      Alert.alert('Link Copied', 'The icon link is ready to paste.');
    } catch (error: any) {
      Alert.alert('Could Not Copy Link', error?.message || 'Clipboard access is unavailable.');
    }
  }, []);

  const renderIcon = useCallback(
    ({ item }: { item: GithubFile }) => (
      <MenuView
        shouldOpenOnLongPress
        title={item.name}
        actions={[
          { id: 'save', title: 'Save Icon', image: 'square.and.arrow.down' },
          { id: 'copy-link', title: 'Copy Icon Link', image: 'link' },
        ]}
        onPressAction={({ nativeEvent }) => {
          if (nativeEvent.event === 'save') void handleSaveIcon(item);
          if (nativeEvent.event === 'copy-link') void handleCopyIconLink(item);
        }}
        style={{ width: iconSize, height: iconSize, borderRadius: iconRadius }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mode === 'select' ? `Select ${item.name}` : `View actions for ${item.name}`}
          onPress={() => handleSelect(item.download_url)}
          style={({ pressed }) => [
            styles.iconCell,
            {
              width: iconSize,
              height: iconSize,
              borderRadius: iconRadius,
              opacity: pressed ? 0.82 : 1,
            },
          ]}
        >
          <Image
            source={item.download_url}
            style={[styles.iconImage, { borderRadius: iconRadius }]}
            contentFit="cover"
            transition={120}
          />
        </Pressable>
      </MenuView>
    ),
    [handleCopyIconLink, handleSaveIcon, handleSelect, iconRadius, iconSize, mode]
  );

  return (
    <>
      {isLoading && iconsList.length === 0 ? (
        <View style={[styles.centerContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color="#0088FF" />
          <Text style={[styles.loadingText, { color: theme.secondaryLabel }]}>Loading gallery...</Text>
        </View>
      ) : (
        <FlatList<GithubFile>
          style={[styles.list, { backgroundColor: theme.background }]}
          data={iconsList}
          keyExtractor={(item) => item.sha}
          numColumns={ICON_COLUMNS}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.iconRow}
          renderItem={renderIcon}
          ListEmptyComponent={() => (
            <View style={styles.centerContainer}>
              <Text style={[styles.emptyText, { color: theme.secondaryLabel }]}>No icons found in the repo.</Text>
            </View>
          )}
        />
      )}
      <Stack.Screen
        options={{
          title: mode === 'select' ? 'Select Icon' : 'Icon Gallery',
          headerLargeTitle: true,
        }}
      />
      {isDeveloperMode ? (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="arrow.up.circle"
            onPress={handleUpload}
            disabled={uploading}
          >
            Upload
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  loadingText: {
    color: '#8E8E93',
    marginTop: 12,
    fontSize: 14,
  },
  emptyText: {
    color: '#8E8E93',
    textAlign: 'center',
  },
  listContent: {
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: 120,
    gap: ICON_GAP,
  },
  iconRow: {
    gap: ICON_GAP,
  },
  iconCell: {
    overflow: 'hidden',
    borderCurve: 'continuous',
  },
  iconImage: {
    width: '100%',
    height: '100%',
    borderCurve: 'continuous',
  },
});
