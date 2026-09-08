import React from 'react';
import { Text } from 'react-native';
import { useAppTheme } from '../theme/app-preferences';

export default function IconCaption({ name, width }: { name: string; width: number }) {
  const theme = useAppTheme();
  return <Text numberOfLines={1} style={{ width, height: 28, textAlign: 'center', fontSize: 12, fontWeight: '500', paddingTop: 6, color: theme.secondaryLabel }}>{name}</Text>;
}
