export interface PreviewRequest {
  type: 'compile';
  source: string;
  id: number;
}

export interface PreviewResponse {
  type: 'result';
  id: number;
  html: string;
  success: boolean;
  errors: string[];
}
