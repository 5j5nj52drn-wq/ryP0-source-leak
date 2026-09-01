import React, { useEffect, useState } from 'react';
import { FlatList, ActivityIndicator, Alert, View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useRepoStore } from '../../store/useRepoStore';
import * as ImagePicker from 'expo-image-picker';
import { Upload } from 'lucide-react-native';

export default function IconsGalleryScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();

  const iconsList = useRepoStore(state => state.iconsList);
  const fetchIcons = useRepoStore(state => state.fetchIcons);
  const uploadIcon = useRepoStore(state => state.uploadIcon);
  const isLoading = useRepoStore(state => state.isLoading);
  const setPendingIconSelection = useRepoStore(state => state.setPendingIconSelection);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchIcons();
  }, []);

  const handleUpload = async () => {
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

  const handleSelect = (url: string) => {
    if (mode === 'select') {
      setPendingIconSelection(url);
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: mode === 'select' ? 'Select Icon' : 'Icon Gallery',
          headerRight: () => (
            <Pressable
              onPress={handleUpload}
              disabled={uploading}
              style={[styles.uploadBtn, uploading && { opacity: 0.5 }]}
            >
              {uploading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <>
                  <Upload color="white" size={16} />
                  <Text style={styles.uploadBtnText}>Upload</Text>
                </>
              )}
            </Pressable>
          ),
        }}
      />

      {isLoading && iconsList.length === 0 ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0088FF" />
          <Text style={styles.loadingText}>Loading gallery...</Text>
        </View>
      ) : (
        <FlatList
          data={iconsList}
          keyExtractor={(item) => item.sha}
          numColumns={3}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item.download_url)}
              style={styles.iconCell}
            >
              <Image
                source={item.download_url}
                style={styles.iconImage}
                contentFit="contain"
              />
            </Pressable>
          )}
          ListEmptyComponent={() => (
            <View style={styles.centerContainer}>
              <Text style={styles.emptyText}>No icons found in the repo.</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    paddingTop: 60,
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
    padding: 12,
    paddingBottom: 120,
  },
  iconCell: {
    margin: 8,
    flex: 1,
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0088FF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 4,
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
