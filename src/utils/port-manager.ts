/**
 * Manages port allocation to avoid conflicts
 */
export class PortManager {
  private usedPorts = new Set<number>();
  private baseOpenCodePort = 4000;
  private baseWebAppPort = 3000;

  /**
   * Allocate a port for an OpenCode instance
   */
  allocateOpenCodePort(): number {
    let port = this.baseOpenCodePort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    this.usedPorts.add(port);
    return port;
  }

  /**
   * Allocate a port for a web app
   */
  allocateWebAppPort(): number {
    let port = this.baseWebAppPort;
    while (this.usedPorts.has(port)) {
      port++;
    }
    this.usedPorts.add(port);
    return port;
  }

  /**
   * Release a port back to the pool
   */
  releasePort(port: number): void {
    this.usedPorts.delete(port);
  }

  /**
   * Check if a port is in use
   */
  isPortInUse(port: number): boolean {
    return this.usedPorts.has(port);
  }
}

export const portManager = new PortManager();
