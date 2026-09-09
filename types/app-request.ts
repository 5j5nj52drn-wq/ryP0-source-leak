/**
 * These values intentionally match the private automation import contract.
 * A consumer only submits a source for review; no request can directly write
 * to the public catalog or publish an IPA.
 */
export const APP_REQUEST_METHODS = [
  'github',
  'repository',
  'direct-url',
  'telegram-r2',
] as const;

export type AppRequestMethod = (typeof APP_REQUEST_METHODS)[number];

export interface AppRequestSubmission {
  name: string;
  description: string;
  category: string;
  sourceUrl: string;
  method: AppRequestMethod;
}

export interface AppRequestRecord extends AppRequestSubmission {
  id: number;
  submittedAt: string;
  issueUrl: string;
  state: 'open' | 'closed';
}
