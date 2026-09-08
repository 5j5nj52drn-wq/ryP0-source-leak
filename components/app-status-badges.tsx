import React from 'react';
import { Text, View } from 'react-native';
import { getAppStatus, getAppStatusKey, getAppUpdatePolicy } from '../services/app-status';
import { useRepoStore } from '../store/useRepoStore';
import type { RepoApp } from '../types/repo';

export default function AppStatusBadges({ app }: { app: RepoApp }) {
  const runtimeStatus = useRepoStore((state) => state.runtimeAppStatuses[getAppStatusKey(app)]);
  const status = getAppStatus(app, runtimeStatus ?? app.status);
  return (
    <View style={{ flexDirection: 'row', gap: 6, height: 24, alignItems: 'center' }}>
      <Text style={{ color: '#FFFFFF', backgroundColor: '#25252D', fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>{getAppUpdatePolicy(app) === 'daily' ? 'Daily Update' : 'Static'}</Text>
      <Text accessibilityLabel={`${status.label}: ${status.message || status.detail}`} style={{ color: status.color, backgroundColor: '#FFFFFF', fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 }}>{status.label}</Text>
    </View>
  );
}
