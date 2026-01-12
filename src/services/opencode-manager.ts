import type { Project, OpenCodeMessage, OpenCodeResponse, OpenCodeAsyncResponse, SessionStatus, SessionMessage } from '../types';
import { portManager } from '../utils/port-manager';
import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk/client';

/**
 * Manages OpenCode server instances for projects
 */
export class OpenCodeManager {
  private projects = new Map<string, Project>();
  private clients = new Map<string, OpencodeClient>();

  /**
   * Get or create an OpenCode SDK client for a project
   */
  private getClient(folder: string): OpencodeClient {
    const existing = this.clients.get(folder);
    if (existing) {
      return existing;
    }

    const project = this.projects.get(folder);
    if (!project || !project.opencodePort) {
      throw new Error(`No OpenCode instance for folder: ${folder}`);
    }

    const client = createOpencodeClient({
      baseUrl: `http://127.0.0.1:${project.opencodePort}`,
    });
    this.clients.set(folder, client);
    return client;
  }

  /**
   * Start an OpenCode server for a project folder
   */
  async startOpenCode(folder: string, projectPath: string): Promise<Project> {
    // Check if already running
    const existing = this.projects.get(folder);
    if (existing && existing.status === 'running') {
      return existing;
    }

    // Allocate a port
    const port = portManager.allocateOpenCodePort();

    // Create project entry
    const project: Project = {
      folder,
      path: projectPath,
      opencodePort: port,
      status: 'starting',
    };

    this.projects.set(folder, project);

    try {
      // Spawn OpenCode server process
      const proc = Bun.spawn(
        ['opencode', 'serve', '--port', port.toString(), '--hostname', '127.0.0.1'],
        {
          cwd: projectPath,
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env },
        }
      );

      // Wait a bit for the server to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check if process is still alive
      if (proc.killed || proc.exitCode !== null) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`OpenCode failed to start: ${stderr}`);
      }

      project.opencodeProcess = proc;
      project.status = 'running';

      // Handle process exit
      proc.exited.then((code) => {
        if (code !== 0 && project.status === 'running') {
          project.status = 'error';
          project.error = `OpenCode process exited with code ${code}`;
        }
        portManager.releasePort(port);
      });

      return project;
    } catch (error) {
      project.status = 'error';
      project.error = error instanceof Error ? error.message : String(error);
      portManager.releasePort(port);
      throw error;
    }
  }

  /**
   * Stop an OpenCode server for a project
   */
  async stopOpenCode(folder: string): Promise<void> {
    const project = this.projects.get(folder);
    if (!project || !project.opencodeProcess) {
      return;
    }

    try {
      // Kill the process
      project.opencodeProcess.kill();
      await project.opencodeProcess.exited;

      // Release the port
      if (project.opencodePort) {
        portManager.releasePort(project.opencodePort);
      }

      // Clean up the SDK client
      this.clients.delete(folder);

      // Update status
      project.status = 'stopped';
      project.opencodeProcess = undefined;
    } catch (error) {
      project.status = 'error';
      project.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Get a project by folder name
   */
  getProject(folder: string): Project | undefined {
    return this.projects.get(folder);
  }

  /**
   * Get all active projects
   */
  getAllProjects(): Project[] {
    return Array.from(this.projects.values());
  }

  /**
   * Ensure a session exists for a folder, creating one if needed
   */
  private async ensureSession(folder: string, sessionId?: string): Promise<string> {
    const client = this.getClient(folder);
    
    if (sessionId) {
      return sessionId;
    }

    const createResult = await client.session.create();
    if (createResult.error) {
      throw new Error(`Failed to create session: ${JSON.stringify(createResult.error)}`);
    }
    const newSessionId = createResult.data?.id;
    if (!newSessionId) {
      throw new Error('Failed to create session: no session ID returned');
    }
    return newSessionId;
  }

  /**
   * Send a message to an OpenCode instance (async - returns immediately)
   * Use getSessionStatus() to poll for results
   */
  async sendMessageAsync(
    folder: string,
    message: OpenCodeMessage
  ): Promise<OpenCodeAsyncResponse> {
    const project = this.projects.get(folder);
    if (!project || project.status !== 'running' || !project.opencodePort) {
      throw new Error(`OpenCode is not running for folder: ${folder}`);
    }

    try {
      const client = this.getClient(folder);
      const sessionId = await this.ensureSession(folder, message.sessionId);

      // Send the message using promptAsync - returns immediately
      const result = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: message.message }],
        },
      });

      if (result.error) {
        throw new Error(`OpenCode API error: ${JSON.stringify(result.error)}`);
      }

      return {
        sessionId,
        status: 'processing',
        statusUrl: `/api/projects/${folder}/sessions/${sessionId}/status`,
      };
    } catch (error) {
      throw new Error(
        `Failed to send message to OpenCode: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Send a message to an OpenCode instance (sync - waits for response)
   * WARNING: May timeout for long-running operations. Use sendMessageAsync for better reliability.
   */
  async sendMessage(
    folder: string,
    message: OpenCodeMessage
  ): Promise<OpenCodeResponse> {
    const project = this.projects.get(folder);
    if (!project || project.status !== 'running' || !project.opencodePort) {
      throw new Error(`OpenCode is not running for folder: ${folder}`);
    }

    try {
      const client = this.getClient(folder);
      const sessionId = await this.ensureSession(folder, message.sessionId);

      // Send the message using the SDK's session.prompt method (waits for completion)
      const result = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: message.message }],
        },
      });

      if (result.error) {
        throw new Error(`OpenCode API error: ${JSON.stringify(result.error)}`);
      }

      return {
        response: JSON.stringify(result.data),
        sessionId: sessionId,
      };
    } catch (error) {
      throw new Error(
        `Failed to send message to OpenCode: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the status and messages of a session
   */
  async getSessionStatus(folder: string, sessionId: string): Promise<SessionStatus> {
    const project = this.projects.get(folder);
    if (!project || project.status !== 'running' || !project.opencodePort) {
      throw new Error(`OpenCode is not running for folder: ${folder}`);
    }

    try {
      const client = this.getClient(folder);
      
      // Get session status
      const statusResult = await client.session.status({ path: { id: sessionId } });
      if (statusResult.error) {
        throw new Error(`Failed to get session status: ${JSON.stringify(statusResult.error)}`);
      }

      // Get messages
      const messagesResult = await client.session.messages({ path: { id: sessionId } });
      if (messagesResult.error) {
        throw new Error(`Failed to get session messages: ${JSON.stringify(messagesResult.error)}`);
      }

      const rawMessages = messagesResult.data || [];
      const messages: SessionMessage[] = rawMessages.map((m: Record<string, unknown>) => ({
        id: (m.id as string) || '',
        role: (m.role as 'user' | 'assistant') || 'assistant',
        content: this.extractMessageContent(m),
        time: m.time as { start: number; end?: number } | undefined,
      }));

      // Determine status from session data
      const sessionData = statusResult.data as Record<string, unknown> | undefined;
      let status: 'idle' | 'running' | 'error' = 'idle';
      if (sessionData?.status === 'running' || sessionData?.busy) {
        status = 'running';
      } else if (sessionData?.error) {
        status = 'error';
      }

      return {
        sessionId,
        status,
        messages,
      };
    } catch (error) {
      throw new Error(
        `Failed to get session status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extract text content from a message object
   */
  private extractMessageContent(message: Record<string, unknown>): string {
    // Messages may have different structures depending on the type
    if (typeof message.content === 'string') {
      return message.content;
    }
    if (Array.isArray(message.parts)) {
      return message.parts
        .filter((p: Record<string, unknown>) => p.type === 'text')
        .map((p: Record<string, unknown>) => p.text || '')
        .join('\n');
    }
    return JSON.stringify(message);
  }

  /**
   * Subscribe to OpenCode events and stream them via SSE
   * Returns an async generator that yields events
   */
  async *streamEvents(
    folder: string,
    sessionId?: string
  ): AsyncGenerator<{ type: string; data: unknown }, void, unknown> {
    const project = this.projects.get(folder);
    if (!project || project.status !== 'running' || !project.opencodePort) {
      throw new Error(`OpenCode is not running for folder: ${folder}`);
    }

    const client = this.getClient(folder);
    
    // Subscribe to the event stream
    const result = await client.event.subscribe();
    
    // Iterate through the stream and yield filtered events
    for await (const event of result.stream) {
      const eventData = event as Record<string, unknown>;
      
      // If sessionId filter is provided, only yield events for that session
      if (sessionId) {
        const props = eventData.properties as Record<string, unknown> | undefined;
        const part = props?.part as Record<string, unknown> | undefined;
        const eventSessionId = props?.sessionID || part?.sessionID;
        if (eventSessionId && eventSessionId !== sessionId) {
          continue;
        }
      }

      yield {
        type: eventData.type as string,
        data: eventData.properties || eventData,
      };
    }
  }

  /**
   * Send a message and stream responses via SSE
   * Returns an async generator of events
   */
  async *sendMessageStream(
    folder: string,
    message: OpenCodeMessage
  ): AsyncGenerator<{ type: string; data: unknown; done?: boolean }, void, unknown> {
    const project = this.projects.get(folder);
    if (!project || project.status !== 'running' || !project.opencodePort) {
      throw new Error(`OpenCode is not running for folder: ${folder}`);
    }

    const client = this.getClient(folder);
    const sessionId = await this.ensureSession(folder, message.sessionId);

    // Emit the session ID first
    yield {
      type: 'session.created',
      data: { sessionId },
    };

    // Start the event stream before sending the message
    const eventResult = await client.event.subscribe();
    
    // Send the message asynchronously
    const promptResult = await client.session.promptAsync({
      path: { id: sessionId },
      body: {
        parts: [{ type: 'text', text: message.message }],
      },
    });

    if (promptResult.error) {
      yield {
        type: 'error',
        data: { error: JSON.stringify(promptResult.error) },
        done: true,
      };
      return;
    }

    // Stream events until session becomes idle
    for await (const event of eventResult.stream) {
      const eventData = event as Record<string, unknown>;
      const eventType = eventData.type as string;
      const props = eventData.properties as Record<string, unknown> | undefined;
      
      // Filter events for this session
      const part = props?.part as Record<string, unknown> | undefined;
      const eventSessionId = props?.sessionID || part?.sessionID;
      if (eventSessionId && eventSessionId !== sessionId) {
        continue;
      }

      // Yield the event
      yield {
        type: eventType,
        data: props || eventData,
      };

      // Stop streaming when session becomes idle
      if (eventType === 'session.idle') {
        yield {
          type: 'done',
          data: { sessionId },
          done: true,
        };
        return;
      }
    }
  }

  /**
   * Get sessions for an OpenCode instance
   */
  async getSessions(folder: string): Promise<string[]> {
    const project = this.projects.get(folder);
    if (!project || project.status !== 'running' || !project.opencodePort) {
      throw new Error(`OpenCode is not running for folder: ${folder}`);
    }

    try {
      const client = this.getClient(folder);
      const result = await client.session.list();

      if (result.error) {
        throw new Error(`OpenCode API error: ${JSON.stringify(result.error)}`);
      }

      // Extract session IDs from the result
      const sessions = result.data || [];
      return sessions.map((s: { id?: string }) => s.id || '').filter(Boolean);
    } catch (error) {
      throw new Error(
        `Failed to get sessions: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop all OpenCode instances
   */
  async stopAll(): Promise<void> {
    const folders = Array.from(this.projects.keys());
    await Promise.all(folders.map((folder) => this.stopOpenCode(folder)));
  }
}

export const opencodeManager = new OpenCodeManager();
