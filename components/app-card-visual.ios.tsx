import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Host } from '@expo/ui';
import { HStack, Image, RNHostView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  clipShape,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  padding,
  shadow,
  shapes,
} from '@expo/ui/swift-ui/modifiers';
import type { AppCardVisualProps } from './app-card-visual.types';
import { APP_CARD_HEIGHT } from './app-card-visual.types';

/**
 * Native iOS card. Typography, layout, badges, continuous corners, gradients,
 * and shadows are all SwiftUI. The icon itself stays in Expo Image so remote
 * catalog URLs retain their cache, progressive loading, and error handling.
 */
export default function AppCardVisual({
  app,
  latestVersionLabel,
  subtitle,
  theme,
  typeLabel,
  statusLabel,
  statusColor,
  statusSymbol,
  preview = false,
  fixedWidth,
}: AppCardVisualProps) {
  const cardWidth = fixedWidth ? { width: fixedWidth } : null;

  return (
    <Host
      ignoreSafeArea="all"
      style={[styles.host, cardWidth, preview && styles.previewHost]}
    >
      <HStack
        spacing={14}
        alignment="center"
        modifiers={[
          frame({ maxWidth: 10000, height: APP_CARD_HEIGHT, alignment: 'leading' }),
          padding({ horizontal: 16 }),
          background(
            {
              type: 'linearGradient',
              colors: [theme.bg, theme.end],
              startPoint: { x: 0, y: 0 },
              endPoint: { x: 1, y: 1 },
            },
            shapes.roundedRectangle({ cornerRadius: 22, roundedCornerStyle: 'continuous' }),
          ),
          clipShape('roundedRectangle', 22),
          shadow({ radius: preview ? 16 : 10, y: preview ? 8 : 5, color: '#00000038' }),
        ]}
      >
        <RNHostView matchContents>
          <View style={styles.iconFrame}>
            <ExpoImage source={{ uri: app.iconURL }} style={styles.icon} contentFit="cover" transition={120} />
          </View>
        </RNHostView>

        <VStack
          alignment="leading"
          spacing={1}
          modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}
        >
          <VStack alignment="leading" spacing={1} modifiers={[padding({ trailing: 92 })]}>
            <Text modifiers={[font({ size: 18, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
              {app.name}
            </Text>
            <Text modifiers={[font({ size: 12.5 }), foregroundStyle('#FFFFFFBF'), lineLimit(1)]}>
              {latestVersionLabel} · {app.bundleIdentifier}
            </Text>
            <Text modifiers={[font({ size: 12.5 }), foregroundStyle('#FFFFFFBF'), lineLimit(1)]}>
              {subtitle}
            </Text>
          </VStack>
          <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 7 })]}>
            <HStack
              spacing={5}
              modifiers={[
                padding({ horizontal: 8, vertical: 3 }),
                background('#FFFFFF30', shapes.capsule()),
              ]}
            >
              <Text modifiers={[font({ size: 10.5, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
                {typeLabel}
              </Text>
              <Text modifiers={[font({ size: 10.5, weight: 'bold' }), foregroundStyle('#FFFFFFAD')]}>·</Text>
              <Image systemName={statusSymbol as any} size={10} color={statusColor} />
              <Text modifiers={[font({ size: 10.5, weight: 'bold' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>
                {statusLabel}
              </Text>
            </HStack>
          </VStack>
        </VStack>
        <Spacer minLength={0} />
      </HStack>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { width: '100%', height: APP_CARD_HEIGHT },
  previewHost: { overflow: 'visible' },
  iconFrame: { width: 64, height: 64, borderRadius: 16, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)' },
  icon: { width: 64, height: 64, borderRadius: 16 },
});
