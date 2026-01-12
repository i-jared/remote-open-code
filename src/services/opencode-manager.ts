import type { Project, OpenCodeMessage, OpenCodeResponse } from '../types';
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
   * Send a message to an OpenCode instance
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
      
      // If no sessionId provided, create a new session
      let sessionId = message.sessionId;
      if (!sessionId) {
        const createResult = await client.session.create();
        if (createResult.error) {
          throw new Error(`Failed to create session: ${JSON.stringify(createResult.error)}`);
        }
        sessionId = createResult.data?.id;
        if (!sessionId) {
          throw new Error('Failed to create session: no session ID returned');
        }
      }

      // Send the message using the SDK's session.prompt method
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
