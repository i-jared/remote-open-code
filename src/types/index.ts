export interface Project {
  folder: string;
  path: string;
  opencodePort?: number;
  opencodeProcess?: ReturnType<typeof Bun.spawn>;
  tailscalePath?: string;
  webAppPort?: number;
  status: 'stopped' | 'starting' | 'running' | 'error';
  error?: string;
}

export interface FolderInfo {
  name: string;
  path: string;
}

export interface OpenCodeMessage {
  message: string;
  sessionId?: string;
  /** If true, returns immediately without waiting for response */
  async?: boolean;
}

export interface OpenCodeResponse {
  response: string;
  sessionId: string;
}

export interface OpenCodeAsyncResponse {
  sessionId: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  /** Poll this endpoint to check status */
  statusUrl: string;
}

export interface SessionStatus {
  sessionId: string;
  status: 'idle' | 'running' | 'error';
  messages: SessionMessage[];
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time?: { start: number; end?: number };
}

export interface TailscaleServeConfig {
  path: string;
  localPort: number;
  public?: boolean; // Use funnel for public access
}
