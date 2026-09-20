export interface RepoVersion {
  version: string;
  buildVersion?: string;
  date: string;
  downloadURL: string;
  size: number;
  /** SHA-256 of the IPA when supplied by the catalog updater. */
  sha256?: string;
  localizedDescription?: string;
  minOSVersion?: string;
}

export interface RepoAppPermissions {
  entitlements?: string[];
  privacy?: {
    [key: string]: string;
  };
}

export type AppUpdatePolicy = 'daily' | 'static';

export interface RepoAppAutomation {
  workflowPath?: string;
  sourceURL?: string;
  repository?: string;
  configId?: string;
}

export interface RepoAppImportSource {
  method?: string;
  sourceURL?: string;
}

export interface RepoAppStatus {
  state: 'healthy' | 'broken' | 'update-error' | 'unknown';
  checkedDownloadURL?: string;
  checkedAt?: string;
  message?: string;
}

export interface RepoApp {
  name: string;
  bundleIdentifier: string;
  developerName: string;
  subtitle?: string;
  localizedDescription?: string;
  iconURL: string;
  tintColor?: string;
  category?: string;
  updatePolicy?: AppUpdatePolicy;
  /** Explicit upstream GitHub project, when an app has one. */
  githubURL?: string;
  automation?: RepoAppAutomation;
  importSource?: RepoAppImportSource;
  status?: RepoAppStatus;
  versions: RepoVersion[];
  appPermissions?: RepoAppPermissions;
}

export interface RepoNews {
  title: string;
  identifier: string;
  caption: string;
  date: string;
  tintColor?: string;
  imageURL?: string;
  appID?: string;
  url?: string;
}

export interface RepoData {
  name: string;
  identifier: string;
  sourceURL?: string;
  iconURL?: string;
  news?: RepoNews[];
  apps: RepoApp[];
}
