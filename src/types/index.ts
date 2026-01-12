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
}

export interface OpenCodeResponse {
  response: string;
  sessionId: string;
}

export interface TailscaleServeConfig {
  path: string;
  localPort: number;
  public?: boolean; // Use funnel for public access
}
