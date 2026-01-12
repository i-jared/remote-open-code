import type { Project, OpenCodeMessage, OpenCodeResponse } from '../types';
import { portManager } from '../utils/port-manager';

/**
 * Manages OpenCode server instances for projects
 */
export class OpenCodeManager {
  private projects = new Map<string, Project>();

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
      // Use the OpenCode SDK to send messages
      // The SDK expects the base URL of the OpenCode server
      const baseUrl = `http://127.0.0.1:${project.opencodePort}`;
      
      // For now, we'll use fetch to communicate with OpenCode's API
      // The exact API endpoint depends on OpenCode's server implementation
      const response = await fetch(`${baseUrl}/api/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.message,
          sessionId: message.sessionId,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenCode API error: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        response: data.response || data.message || '',
        sessionId: data.sessionId || message.sessionId || '',
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
      const baseUrl = `http://127.0.0.1:${project.opencodePort}`;
      const response = await fetch(`${baseUrl}/api/sessions`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`OpenCode API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.sessions || [];
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
