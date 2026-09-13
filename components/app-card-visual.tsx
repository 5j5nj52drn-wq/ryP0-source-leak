import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import type { AppCardVisualProps } from './app-card-visual.types';
import { APP_CARD_HEIGHT } from './app-card-visual.types';

/**
 * Web and Android fallback. iOS uses app-card-visual.ios.tsx, whose card
 * surface is made from real SwiftUI views.
 */
export default function AppCardVisual({
  app,
  latestVersionLabel,
  subtitle,
  theme,
  typeLabel,
  statusLabel,
  statusColor,
  preview = false,
  fixedWidth,
}: AppCardVisualProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.surface,
        { backgroundColor: theme.bg },
        fixedWidth ? { width: fixedWidth } : null,
        preview && styles.preview,
      ]}
    >
      <View style={styles.content}>
        <Image source={{ uri: app.iconURL }} style={styles.icon} contentFit="cover" transition={120} />
        <View style={styles.info}>
          <View style={styles.topInfo}>
            <Text style={styles.title} numberOfLines={1}>{app.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>{latestVersionLabel} · {app.bundleIdentifier}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <View style={styles.badges}>
            <Text style={styles.policy} numberOfLines={1}>
              {typeLabel} · <Text style={[styles.status, { color: statusColor }]}>{statusLabel}</Text>
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    height: APP_CARD_HEIGHT,
    width: '100%',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 5,
  },
  preview: { shadowOpacity: 0.26, shadowRadius: 20, elevation: 8 },
  content: { height: '100%', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  icon: { width: 64, height: 64, borderRadius: 16, marginRight: 14, backgroundColor: 'rgba(255,255,255,0.14)' },
  info: { flex: 1, minWidth: 0, justifyContent: 'center' },
  topInfo: { paddingRight: 94 },
  title: { color: '#FFF', fontFamily: Platform.OS === 'ios' ? 'System' : undefined, fontSize: 18, lineHeight: 23, fontWeight: '700' },
  meta: { color: 'rgba(255,255,255,0.76)', fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  subtitle: { color: 'rgba(255,255,255,0.76)', fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  badges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  policy: { color: '#FFF', backgroundColor: 'rgba(255,255,255,0.20)', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, fontSize: 10.5, fontWeight: '700', alignSelf: 'flex-start' },
  status: { fontSize: 10.5, fontWeight: '700' },
});
