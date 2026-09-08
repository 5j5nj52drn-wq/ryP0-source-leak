import React from 'react';
import { Host } from '@expo/ui';
import { HStack, Image, Text } from '@expo/ui/swift-ui';
import { accessibilityLabel, background, font, foregroundStyle, frame, lineLimit, padding, shapes } from '@expo/ui/swift-ui/modifiers';
import { getAppStatus, getAppStatusKey, getAppUpdatePolicy } from '../services/app-status';
import { useRepoStore } from '../store/useRepoStore';
import type { RepoApp } from '../types/repo';

export default function AppStatusBadges({ app }: { app: RepoApp }) {
  const runtimeStatus = useRepoStore((state) => state.runtimeAppStatuses[getAppStatusKey(app)]);
  const status = getAppStatus(app, runtimeStatus ?? app.status);
  const typeLabel = getAppUpdatePolicy(app) === 'daily' ? 'Daily Update' : 'Static';
  const statusDescription = `${status.label}: ${status.message || status.detail}`;
  return (
    <Host style={{ width: '100%', height: 22 }} ignoreSafeArea="all">
      <HStack spacing={6} modifiers={[frame({ maxWidth: 10000, alignment: 'leading' })]}>
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), lineLimit(1), foregroundStyle('#FFFFFF'), padding({ horizontal: 8, vertical: 3 }), background('#25252DE0', shapes.capsule())]}>
          {typeLabel}
        </Text>
        <HStack spacing={4} modifiers={[padding({ horizontal: 8, vertical: 3 }), background('#FFFFFFF0', shapes.capsule()), accessibilityLabel(statusDescription)]}>
          <Image systemName={status.symbol} size={10} color={status.color} />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), lineLimit(1), foregroundStyle(status.color)]}>{status.label}</Text>
        </HStack>
      </HStack>
    </Host>
  );
}
