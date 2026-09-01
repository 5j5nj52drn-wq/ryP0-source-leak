import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useRepoStore } from '../store/useRepoStore';
import { RepoApp } from '../types/repo';
import { Link2, GitBranch, Globe, Plus, X } from 'lucide-react-native';

export default function AddAppScreen() {
  const router = useRouter();
  const repo = useRepoStore(state => state.repo);
  const reorderApps = useRepoStore(state => state.reorderApps);

  const [activeTab, setActiveTab] = useState<'direct' | 'github' | 'repo' | 'manual'>('direct');
  const [loading, setLoading] = useState(false);

  // Direct IPA state
  const [directUrl, setDirectUrl] = useState('');
  const [directName, setDirectName] = useState('');

  // GitHub Release state
  const [githubRepo, setGithubRepo] = useState(''); // e.g. "samg/Filza"

  // Repo import state
  const [thirdPartyRepoUrl, setThirdPartyRepoUrl] = useState('');

  // Manual state
  const [name, setName] = useState('');
  const [bundleId, setBundleId] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [developer, setDeveloper] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [category, setCategory] = useState('Sideloading');

  const handleAddDirect = () => {
    if (!directUrl) {
      Alert.alert('Error', 'Please enter an IPA URL');
      return;
    }

    const cleanUrl = directUrl.trim();
    const urlFilename = cleanUrl.split('/').pop()?.replace('.ipa', '') || 'Custom App';
    const appName = directName.trim() || urlFilename;
    const cleanBundle = `com.custom.${appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const newApp: RepoApp = {
      name: appName,
      bundleIdentifier: cleanBundle,
      developerName: 'Direct Import',
      subtitle: `Imported from direct IPA link`,
      iconURL: 'https://raw.githubusercontent.com/ry0-x/ry0-x.github.io/main/icons/default.png',
      category: 'Sideloading',
      versions: [
        {
          version: '1.0.0',
          date: new Date().toISOString().split('T')[0],
          downloadURL: cleanUrl,
          size: 0,
        }
      ]
    };

    if (repo) {
      reorderApps([newApp, ...repo.apps]);
      Alert.alert('App Added', `${appName} has been added to your repository.`);
      router.back();
    }
  };

  const handleFetchGithub = async () => {
    if (!githubRepo) {
      Alert.alert('Error', 'Please enter a GitHub repository (e.g. owner/repo)');
      return;
    }

    setLoading(true);
    try {
      const cleanRepo = githubRepo.trim().replace('https://github.com/', '');
      const response = await fetch(`https://api.github.com/repos/${cleanRepo}/releases/latest`);
      if (!response.ok) throw new Error('Release not found on GitHub');

      const data = await response.json();
      const ipaAsset = data.assets?.find((a: any) => a.name.endsWith('.ipa'));

      if (!ipaAsset) {
        throw new Error('No .ipa file found in the latest GitHub release');
      }

      const repoParts = cleanRepo.split('/');
      const appName = repoParts[1] || data.name || 'GitHub App';
      const cleanBundle = `com.${repoParts[0].toLowerCase()}.${appName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      const newApp: RepoApp = {
        name: appName,
        bundleIdentifier: cleanBundle,
        developerName: repoParts[0] || 'GitHub',
        subtitle: data.name || `Latest release: ${data.tag_name}`,
        iconURL: 'https://raw.githubusercontent.com/ry0-x/ry0-x.github.io/main/icons/default.png',
        category: 'Sideloading',
        versions: [
          {
            version: data.tag_name?.replace('v', '') || '1.0.0',
            date: data.published_at ? data.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
            downloadURL: ipaAsset.browser_download_url,
            size: ipaAsset.size || 0,
          }
        ]
      };

      if (repo) {
        reorderApps([newApp, ...repo.apps]);
        Alert.alert('GitHub App Added', `${appName} (${data.tag_name}) has been imported!`);
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImportRepo = async () => {
    if (!thirdPartyRepoUrl) {
      Alert.alert('Error', 'Please enter a valid repo.json URL');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(thirdPartyRepoUrl.trim());
      if (!response.ok) throw new Error('Failed to fetch source repository JSON');

      const externalRepo = await response.json();
      if (!externalRepo.apps || !Array.isArray(externalRepo.apps)) {
        throw new Error('Invalid repository JSON: missing apps array');
      }

      const importedApps: RepoApp[] = externalRepo.apps;
      if (repo) {
        // Merge without duplicates
        const existingBundleIds = new Set(repo.apps.map(a => a.bundleIdentifier));
        const newAppsToAdd = importedApps.filter(a => !existingBundleIds.has(a.bundleIdentifier));
        
        reorderApps([...repo.apps, ...newAppsToAdd]);
        Alert.alert('Import Success', `Successfully imported ${newAppsToAdd.length} apps from repository.`);
        router.back();
      }
    } catch (e: any) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualAdd = () => {
    if (!name || !bundleId) {
      Alert.alert('Error', 'Name and Bundle Identifier are required.');
      return;
    }

    const newApp: RepoApp = {
      name,
      bundleIdentifier: bundleId,
      developerName: developer || 'Unknown Developer',
      iconURL: iconUrl || 'https://raw.githubusercontent.com/ry0-x/ry0-x.github.io/main/icons/default.png',
      category: category || 'Sideloading',
      versions: [
        {
          version: version || '1.0.0',
          date: new Date().toISOString().split('T')[0],
          downloadURL: downloadUrl || '',
          size: 0,
        }
      ]
    };

    if (repo) {
      reorderApps([newApp, ...repo.apps]);
      Alert.alert('App Added', `${name} has been added.`);
      router.back();
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Upload / Add App</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
          <X size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          onPress={() => setActiveTab('direct')}
          style={[styles.tabBtn, activeTab === 'direct' && styles.activeTabBtn]}
        >
          <Link2 size={16} color={activeTab === 'direct' ? '#0088FF' : '#666'} />
          <Text style={[styles.tabBtnText, activeTab === 'direct' && styles.activeTabBtnText]}>
            Direct IPA
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('github')}
          style={[styles.tabBtn, activeTab === 'github' && styles.activeTabBtn]}
        >
          <GitBranch size={16} color={activeTab === 'github' ? '#0088FF' : '#666'} />
          <Text style={[styles.tabBtnText, activeTab === 'github' && styles.activeTabBtnText]}>
            GitHub
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('repo')}
          style={[styles.tabBtn, activeTab === 'repo' && styles.activeTabBtn]}
        >
          <Globe size={16} color={activeTab === 'repo' ? '#0088FF' : '#666'} />
          <Text style={[styles.tabBtnText, activeTab === 'repo' && styles.activeTabBtnText]}>
            Repo Link
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('manual')}
          style={[styles.tabBtn, activeTab === 'manual' && styles.activeTabBtn]}
        >
          <Plus size={16} color={activeTab === 'manual' ? '#0088FF' : '#666'} />
          <Text style={[styles.tabBtnText, activeTab === 'manual' && styles.activeTabBtnText]}>
            Manual
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* DIRECT IPA TAB */}
        {activeTab === 'direct' && (
          <View style={styles.formCard}>
            <Text style={styles.sectionHeading}>Direct .ipa URL</Text>
            <Text style={styles.sectionSub}>
              Paste direct download link to an .ipa file. Metadata will be auto-generated.
            </Text>

            <Text style={styles.inputLabel}>IPA Download URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://example.com/app.ipa"
              placeholderTextColor="#999"
              value={directUrl}
              onChangeText={setDirectUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.inputLabel}>App Display Name (Optional)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Minecraft Java"
              placeholderTextColor="#999"
              value={directName}
              onChangeText={setDirectName}
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddDirect}>
              <Text style={styles.submitBtnText}>Add to Repository</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* GITHUB TAB */}
        {activeTab === 'github' && (
          <View style={styles.formCard}>
            <Text style={styles.sectionHeading}>GitHub Release Fetcher</Text>
            <Text style={styles.sectionSub}>
              Enter repository in format 'owner/repo' or paste release link.
            </Text>

            <Text style={styles.inputLabel}>GitHub Repository</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. OatmealDome/DolphiniOS"
              placeholderTextColor="#999"
              value={githubRepo}
              onChangeText={setGithubRepo}
              autoCapitalize="none"
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleFetchGithub} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Fetch & Import Latest Release</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* REPO EXTRACTOR TAB */}
        {activeTab === 'repo' && (
          <View style={styles.formCard}>
            <Text style={styles.sectionHeading}>Third-Party Repo Import</Text>
            <Text style={styles.sectionSub}>
              Import apps from another AltStore/SideStore compatible repo.json.
            </Text>

            <Text style={styles.inputLabel}>Repository JSON URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://community-apps.io/repo.json"
              placeholderTextColor="#999"
              value={thirdPartyRepoUrl}
              onChangeText={setThirdPartyRepoUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleImportRepo} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Extract & Merge Apps</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* MANUAL TAB */}
        {activeTab === 'manual' && (
          <View style={styles.formCard}>
            <Text style={styles.sectionHeading}>Manual App Details</Text>

            <Text style={styles.inputLabel}>App Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Amethyst"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.inputLabel}>Bundle Identifier</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. org.angelaz.amethyst"
              placeholderTextColor="#999"
              value={bundleId}
              onChangeText={setBundleId}
              autoCapitalize="none"
            />

            <Text style={styles.inputLabel}>Version</Text>
            <TextInput
              style={styles.input}
              placeholder="1.0.0"
              placeholderTextColor="#999"
              value={version}
              onChangeText={setVersion}
            />

            <Text style={styles.inputLabel}>Developer Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Henrik Rydgård"
              placeholderTextColor="#999"
              value={developer}
              onChangeText={setDeveloper}
            />

            <Text style={styles.inputLabel}>Icon URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://.../icon.png"
              placeholderTextColor="#999"
              value={iconUrl}
              onChangeText={setIconUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <Text style={styles.inputLabel}>Download URL</Text>
            <TextInput
              style={styles.input}
              placeholder="https://.../app.ipa"
              placeholderTextColor="#999"
              value={downloadUrl}
              onChangeText={setDownloadUrl}
              autoCapitalize="none"
              keyboardType="url"
            />

            <TouchableOpacity style={styles.submitBtn} onPress={handleManualAdd}>
              <Text style={styles.submitBtnText}>Create App</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    gap: 4,
  },
  activeTabBtn: {
    backgroundColor: '#EBF5FF',
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  activeTabBtnText: {
    color: '#0088FF',
  },
  contentContainer: {
    padding: 16,
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  submitBtn: {
    backgroundColor: '#0088FF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
