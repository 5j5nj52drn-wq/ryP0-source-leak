import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { type IpaUploaderProps, useIpaUploader } from './ipa-uploader-controller';

export default function IpaUploader({
  accentColor,
  disabled = false,
  labelColor,
  secondaryLabelColor,
  onUploaded,
}: IpaUploaderProps) {
  const upload = useIpaUploader(onUploaded);
  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: labelColor }]}>Upload from Files</Text>
      <Pressable
        accessibilityRole="button"
        disabled={disabled || upload.isPicking}
        onPress={upload.isUploading ? upload.cancelUpload : () => void upload.beginUpload()}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: accentColor, opacity: disabled || upload.isPicking ? 0.5 : pressed ? 0.8 : 1 },
        ]}
      >
        {upload.isPicking ? <ActivityIndicator color="#FFFFFF" /> : null}
        <Text style={styles.buttonLabel}>{upload.buttonLabel}</Text>
      </Pressable>
      {upload.isUploading ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { backgroundColor: accentColor, width: `${upload.progress * 100}%` }]} />
        </View>
      ) : null}
      <Text selectable style={[styles.detail, { color: upload.phase === 'error' ? '#FF3B30' : secondaryLabelColor }]}>
        {upload.detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginBottom: 16, width: '100%' },
  label: { fontSize: 13, fontWeight: '600' },
  button: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14 },
  buttonLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  progressTrack: { backgroundColor: 'rgba(120, 120, 128, 0.2)', borderRadius: 2, height: 4, overflow: 'hidden' },
  progressFill: { borderRadius: 2, height: '100%' },
  detail: { fontSize: 12, lineHeight: 17 },
});
