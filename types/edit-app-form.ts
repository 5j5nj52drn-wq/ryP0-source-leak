import type { RepoApp, RepoVersion } from './repo';

export type EditableAppFields = Pick<
  RepoApp,
  'name' | 'subtitle' | 'localizedDescription' | 'iconURL' | 'tintColor' | 'category'
> & {
  /**
   * Supplied by the Versions editor when a custom release is added. Optional so
   * platform fallbacks that only edit metadata keep the source versions intact.
   */
  versions?: RepoVersion[];
};

export interface EditAppFormProps {
  app: RepoApp;
  appIndex: number;
  initialSection?: 'card' | 'page' | 'versions';
  onCancel: () => void;
  /** Resolves only after the change is safely stored by the repository source of truth. */
  onSave: (fields: EditableAppFields) => void | Promise<void>;
}
