export const APP_REQUEST_METHODS = ['updatable-source', 'direct-ipa', 'message-link'] as const;

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
