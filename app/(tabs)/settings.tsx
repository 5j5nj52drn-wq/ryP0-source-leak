import React, { useCallback, useEffect } from 'react';
import { View, Alert } from 'react-native';
import { useRepoStore } from '../../store/useRepoStore';
import { FieldGroup, TextInput, Button, useNativeState, Host, Text, ListItem } from '@expo/ui';

export default function Settings() {
  const { githubToken, setGithubToken, isDeveloperMode } = useRepoStore();
  const token = useNativeState('');

  useEffect(() => {
    token.value = githubToken || '';
  }, [githubToken]);

  const handleChangeText = useCallback((value: string) => {
    'worklet';
    token.value = value;
  }, [token]);

  const handleSave = () => {
    setGithubToken(token.value);
    if (token.value.trim().length > 0) {
      Alert.alert('Developer Mode Enabled', 'Your GitHub PAT has been securely saved. Admin controls and repository editing are now active.');
    } else {
      Alert.alert('Read-Only Mode', 'Logged out of Developer Mode. App is now in Consumer / Read-Only mode.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <Host style={{ flex: 1 }}>
        <FieldGroup>
          <FieldGroup.Section title="Current Status">
            <ListItem>
              <Text>
                {isDeveloperMode ? '🟢 Developer Mode (Full Admin Access)' : '🔒 Consumer Mode (Read-Only)'}
              </Text>
            </ListItem>
          </FieldGroup.Section>

          <FieldGroup.Section title="Developer Authentication">
            <TextInput 
              value={token} 
              onChangeText={handleChangeText} 
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" 
              secureTextEntry
            />
            <FieldGroup.SectionFooter>
              <Text>Enter your GitHub Personal Access Token (PAT) with repo scopes to unlock full administrative access, app editing, and commit capabilities.</Text>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
          
          <FieldGroup.Section>
            <Button onPress={handleSave}>
              <Text>{token.value ? 'Save & Unlock Developer Mode' : 'Clear & Switch to Read-Only'}</Text>
            </Button>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
}
