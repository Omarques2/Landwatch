import type { ApiKeyPrincipal } from '../../auth/authed-request.type';

export type AnalysisPdfResult = {
  buffer: Buffer;
  filename: string;
  contentType: 'application/pdf';
  hasAttachments: boolean;
};

export type AnalysisPdfUserContext = {
  mode: 'user';
  userSubject: string;
  orgHeader?: string | string[] | null;
  apiBaseUrl?: string | null;
  webBaseUrl?: string | null;
};

export type AnalysisPdfAutomationContext = {
  mode: 'automation';
  apiKey: ApiKeyPrincipal;
  apiBaseUrl?: string | null;
  webBaseUrl?: string | null;
};

export type AnalysisPdfRequestContext =
  | AnalysisPdfUserContext
  | AnalysisPdfAutomationContext;

export type AnalysisPdfMapImage = {
  buffer: Buffer;
  debugSvg: string;
};
