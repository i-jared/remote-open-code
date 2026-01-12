# Remote OpenCode Project Manager

A TypeScript REST API server built with Bun that manages multiple project folders, spawns OpenCode.ai instances for each, and exposes projects via Tailscale proxy.

## Features

- **Folder Management**: List and manage project folders in a directory
- **OpenCode Integration**: Spawn and manage multiple OpenCode server instances
- **Message Handling**: Send messages to OpenCode instances and receive responses
- **Tailscale Proxy**: Expose project web applications via Tailscale serve/funnel
- **Process Management**: Automatic port allocation and graceful shutdown

## Prerequisites

1. **Bun** - Install from [bun.sh](https://bun.sh)
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

2. **OpenCode CLI** - Install globally or use via `bunx`
   ```bash
   npm install -g opencode
   # or
   bunx opencode
   ```

3. **Tailscale** - Install and configure Tailscale
   - Install from [tailscale.com](https://tailscale.com/download)
   - Authenticate your machine: `tailscale up`

## Installation

```bash
# Install dependencies
bun install

# Run the server
bun run dev
```

## Configuration

Set environment variables:

- `PORT` - Server port (default: 3000)
- `BASE_DIRECTORY` - Directory to scan for projects (default: current working directory)
- `TAILSCALE_HOSTNAME` - Your Tailscale machine hostname (for URL generation)

## API Endpoints

### Folders

- `GET /api/folders` - List all project folders

### Projects

- `GET /api/projects` - List all active project instances
- `POST /api/projects/:folder/start` - Start OpenCode server for a folder
- `DELETE /api/projects/:folder/stop` - Stop OpenCode server
- `POST /api/projects/:folder/message` - Send message to OpenCode
  ```json
  {
    "message": "Your message here",
    "sessionId": "optional-session-id"
  }
  ```
- `GET /api/projects/:folder/sessions` - List OpenCode sessions

### Tailscale

- `POST /api/projects/:folder/serve` - Expose project via Tailscale
  ```json
  {
    "localPort": 3000,
    "path": "/project-name",
    "public": false
  }
  ```
- `DELETE /api/projects/:folder/serve` - Stop Tailscale proxy

## Usage Example

```bash
# List available folders
curl http://localhost:3000/api/folders

# Start OpenCode for a project
curl -X POST http://localhost:3000/api/projects/my-project/start

# Send a message to OpenCode
curl -X POST http://localhost:3000/api/projects/my-project/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, OpenCode!"}'

# Expose project via Tailscale
curl -X POST http://localhost:3000/api/projects/my-project/serve \
  -H "Content-Type: application/json" \
  -d '{"localPort": 3000, "path": "/my-project"}'

# Stop OpenCode
curl -X DELETE http://localhost:3000/api/projects/my-project/stop
```

## Project Structure

```
remote-open-code/
├── src/
│   ├── index.ts              # Entry point (Bun.serve setup)
│   ├── router.ts             # Request router/handler
│   ├── handlers/
│   │   ├── folders.ts        # Folder listing handlers
│   │   ├── projects.ts       # Project/opencode management handlers
│   │   └── tailscale.ts      # Tailscale proxy handlers
│   ├── services/
│   │   ├── folder-service.ts # Directory operations (using Bun APIs)
│   │   ├── opencode-manager.ts # OpenCode process lifecycle (Bun.spawn)
│   │   └── tailscale-service.ts # Tailscale CLI wrapper (Bun.spawn)
│   ├── types/
│   │   └── index.ts          # Type definitions
│   └── utils/
│       └── port-manager.ts   # Dynamic port allocation
├── package.json
├── tsconfig.json
└── README.md
```

## Architecture

- **Bun HTTP Server**: Native `Bun.serve` for high performance
- **Process Management**: `Bun.spawn` for managing OpenCode and Tailscale processes
- **File System**: Bun's native file APIs for directory operations
- **Port Management**: Automatic port allocation to avoid conflicts

## Graceful Shutdown

The server handles SIGINT and SIGTERM signals gracefully:
- Stops all OpenCode instances
- Stops all Tailscale serves
- Cleans up allocated ports

## License

MIT
