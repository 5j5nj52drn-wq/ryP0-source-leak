import type { AppUpdatePolicy } from './repo';

/**
 * Where an imported IPA is delivered from. A source delivery keeps the
 * upstream URL; a mirror is an explicit opt-in copy in ryP0's release store.
 */
export const IMPORT_DELIVERY_MODES = [
  'direct-source',
  'mirror-release',
  'r2',
] as const;

export type ImportDeliveryMode = (typeof IMPORT_DELIVERY_MODES)[number];

export const IMPORT_DELIVERY_MODE_OPTIONS: ReadonlyArray<{
  id: ImportDeliveryMode;
  label: string;
}> = [
  { id: 'direct-source', label: 'Use original source link' },
  { id: 'mirror-release', label: 'Keep a mirror copy' },
  { id: 'r2', label: 'Store securely in R2' },
];

export function isImportDeliveryMode(value: unknown): value is ImportDeliveryMode {
  return typeof value === 'string'
    && (IMPORT_DELIVERY_MODES as readonly string[]).includes(value);
}

/** Daily imports retain only the current version; static imports can keep a manual history. */
export const IMPORT_UPDATE_POLICY_OPTIONS: ReadonlyArray<{
  id: AppUpdatePolicy;
  label: string;
}> = [
  { id: 'daily', label: 'Daily updates' },
  { id: 'static', label: 'Static / manual' },
];

export const IMPORT_HISTORY_LIMITS = [1, 3, 5, 10] as const;

export type ImportHistoryLimit = (typeof IMPORT_HISTORY_LIMITS)[number];

export function isImportHistoryLimit(value: unknown): value is ImportHistoryLimit {
  return typeof value === 'number'
    && (IMPORT_HISTORY_LIMITS as readonly number[]).includes(value);
}
