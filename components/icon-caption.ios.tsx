import React from 'react';
import { Host } from '@expo/ui';
import { Text } from '@expo/ui/swift-ui';
import { font, foregroundStyle, frame, lineLimit, truncationMode } from '@expo/ui/swift-ui/modifiers';

export default function IconCaption({ name, width }: { name: string; width: number }) {
  return (
    <Host style={{ width, height: 28 }} ignoreSafeArea="all">
      <Text modifiers={[font({ size: 12, weight: 'medium' }), lineLimit(1), truncationMode('tail'), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), frame({ width, height: 28 })]}>{name}</Text>
    </Host>
  );
}
