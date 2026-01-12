import type { TailscaleServeConfig } from '../types';
import { opencodeManager } from './opencode-manager';

/**
 * Service for managing Tailscale serve/funnel commands
 */
export class TailscaleService {
  private activeServes = new Map<string, { path: string; localPort: number; process?: ReturnType<typeof Bun.spawn> }>();

  /**
   * Expose a local port via Tailscale serve
   */
  async serve(config: TailscaleServeConfig, folder: string): Promise<void> {
    const existing = this.activeServes.get(folder);
    if (existing) {
      // Already serving, update if needed
      if (existing.localPort !== config.localPort || existing.path !== config.path) {
        await this.stopServe(folder);
      } else {
        return; // Already configured correctly
      }
    }

    try {
      // Build tailscale serve command
      const args = [
        'serve',
        '--bg',
        '--set-path',
        config.path,
        `http://localhost:${config.localPort}`,
      ];

      // Use funnel for public access if requested
      if (config.public) {
        args.push('--funnel');
      }

      // Spawn tailscale serve process
      const proc = Bun.spawn(['tailscale', ...args], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env },
      });

      // Wait a moment for the command to execute
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Check if process failed immediately
      const exitCode = proc.exitCode;
      if (exitCode !== null && exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        throw new Error(`Tailscale serve failed: ${stderr}`);
      }

      // Store the serve configuration
      this.activeServes.set(folder, {
        path: config.path,
        localPort: config.localPort,
        process: proc,
      });

      // Update project with tailscale info
      const project = opencodeManager.getProject(folder);
      if (project) {
        project.tailscalePath = config.path;
        project.webAppPort = config.localPort;
      }
    } catch (error) {
      throw new Error(
        `Failed to start Tailscale serve: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Stop Tailscale serve for a folder
   */
  async stopServe(folder: string): Promise<void> {
    const serve = this.activeServes.get(folder);
    if (!serve) {
      return;
    }

    try {
      // Use tailscale serve --reset to stop serving
      const proc = Bun.spawn(['tailscale', 'serve', '--reset', '--set-path', serve.path], {
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env },
      });

      await proc.exited;

      // Clean up
      this.activeServes.delete(folder);

      // Update project
      const project = opencodeManager.getProject(folder);
      if (project) {
        project.tailscalePath = undefined;
        project.webAppPort = undefined;
      }
    } catch (error) {
      throw new Error(
        `Failed to stop Tailscale serve: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the Tailscale serve status for a folder
   */
  getServeStatus(folder: string): { path: string; localPort: number } | undefined {
    const serve = this.activeServes.get(folder);
    if (!serve) {
      return undefined;
    }
    return {
      path: serve.path,
      localPort: serve.localPort,
    };
  }

  /**
   * Stop all active Tailscale serves
   */
  async stopAll(): Promise<void> {
    const folders = Array.from(this.activeServes.keys());
    await Promise.all(folders.map((folder) => this.stopServe(folder)));
  }
}

export const tailscaleService = new TailscaleService();
