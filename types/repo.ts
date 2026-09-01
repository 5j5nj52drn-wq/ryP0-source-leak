export interface RepoVersion {
  version: string;
  date: string;
  downloadURL: string;
  size: number;
  localizedDescription?: string;
  minOSVersion?: string;
}

export interface RepoAppPermissions {
  entitlements?: string[];
  privacy?: {
    [key: string]: string;
  };
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
