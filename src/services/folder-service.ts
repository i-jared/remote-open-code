import type { FolderInfo } from '../types';

/**
 * Service for directory operations using Bun's native APIs
 */
export class FolderService {
  private baseDirectory: string;

  constructor(baseDirectory: string = process.cwd()) {
    this.baseDirectory = baseDirectory;
  }

  /**
   * List all folders in the base directory
   */
  async listFolders(): Promise<FolderInfo[]> {
    try {
      const entries = await Bun.readdir(this.baseDirectory, { withFileTypes: true });

      const folders: FolderInfo[] = [];

      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          folders.push({
            name: entry.name,
            path: `${this.baseDirectory}/${entry.name}`,
          });
        }
      }

      return folders.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      throw new Error(`Failed to list folders: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a folder exists
   */
  async folderExists(folderName: string): Promise<boolean> {
    try {
      const path = `${this.baseDirectory}/${folderName}`;
      const stat = await Bun.stat(path);
      return stat.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get the full path for a folder
   */
  getFolderPath(folderName: string): string {
    return `${this.baseDirectory}/${folderName}`;
  }

  /**
   * Set a new base directory
   */
  setBaseDirectory(directory: string): void {
    this.baseDirectory = directory;
  }

  /**
   * Get the current base directory
   */
  getBaseDirectory(): string {
    return this.baseDirectory;
  }
}

export const folderService = new FolderService();
