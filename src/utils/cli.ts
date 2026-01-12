/**
 * CLI argument parsing and help
 */

export interface CLIOptions {
  directory: string;
  port: number;
  help: boolean;
  doctor: boolean;
  version: boolean;
}

const VERSION = '1.0.0';

const HELP_TEXT = `
Remote OpenCode Project Manager

Usage:
  remote-open-code [directory] [options]

Arguments:
  directory          Directory containing project folders (default: current directory)

Options:
  -p, --port <port>  Port to run the server on (default: 3000)
  -d, --doctor       Check if all dependencies are installed
  -v, --version      Show version number
  -h, --help         Show this help message

Examples:
  remote-open-code                     # Run in current directory on port 3000
  remote-open-code ~/projects          # Run in ~/projects directory
  remote-open-code ~/projects -p 8080  # Run on port 8080
  remote-open-code --doctor            # Check dependencies

Documentation: https://github.com/your-username/remote-open-code
`;

export function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    directory: process.cwd(),
    port: 3000,
    help: false,
    doctor: false,
    version: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
    } else if (arg === '-v' || arg === '--version') {
      options.version = true;
    } else if (arg === '-d' || arg === '--doctor') {
      options.doctor = true;
    } else if (arg === '-p' || arg === '--port') {
      const portStr = args[++i];
      const port = parseInt(portStr, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.error(`Error: Invalid port number: ${portStr}`);
        process.exit(1);
      }
      options.port = port;
    } else if (!arg.startsWith('-')) {
      // Positional argument = directory
      let dir = arg;
      // Expand ~ to home directory
      if (dir.startsWith('~/')) {
        dir = dir.replace('~/', `${process.env.HOME}/`);
      } else if (dir === '~') {
        dir = process.env.HOME || '';
      }
      // Resolve to absolute path
      if (!dir.startsWith('/')) {
        dir = `${process.cwd()}/${dir}`;
      }
      options.directory = dir;
    } else {
      console.error(`Error: Unknown option: ${arg}`);
      console.log(HELP_TEXT);
      process.exit(1);
    }
  }

  return options;
}

export function showHelp(): void {
  console.log(HELP_TEXT);
}

export function showVersion(): void {
  console.log(`remote-open-code v${VERSION}`);
}
