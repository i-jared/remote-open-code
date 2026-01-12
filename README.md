# Remote OpenCode Project Manager

A CLI tool that manages multiple project folders, spawns [OpenCode.ai](https://opencode.ai) instances for each, and exposes projects via Tailscale proxy.

## Quick Start

```bash
# Run instantly with bunx (recommended)
bunx remote-open-code ~/projects

# Or with npx
npx remote-open-code ~/projects
```

## Installation

```bash
# Global install with bun
bun install -g remote-open-code

# Or with npm
npm install -g remote-open-code
```

Then run from anywhere:
```bash
remote-open-code ~/my-projects
```

## Prerequisites

### Required

**OpenCode CLI** — AI coding assistant
```bash
# macOS / Linux
curl -fsSL https://opencode.ai/install.sh | sh
```

### Optional

**Tailscale** — For exposing projects over your tailnet
```bash
# macOS
brew install tailscale

# Linux
curl -fsSL https://tailscale.com/install.sh | sh

# Then authenticate
tailscale up
```

### Check Your Setup

Run the doctor command to verify everything is installed:

```bash
remote-open-code --doctor
```

## Usage

```bash
# Run in current directory
remote-open-code

# Run in a specific directory
remote-open-code ~/projects

# Run on a custom port
remote-open-code ~/projects --port 8080

# Check dependencies
remote-open-code --doctor

# Show help
remote-open-code --help
```

## API Endpoints

Once running, the server exposes these endpoints:

### Folders

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/folders` | List all project folders |

### Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List all active project instances |
| POST | `/api/projects/:folder/start` | Start OpenCode server for a folder |
| DELETE | `/api/projects/:folder/stop` | Stop OpenCode server |
| GET | `/api/projects/:folder/sessions` | List OpenCode sessions |
| GET | `/api/projects/:folder/sessions/:id/status` | Get session status and messages |

### Messaging

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:folder/message` | Send message (sync, may timeout) |
| POST | `/api/projects/:folder/message?async=true` | Send message (async, returns immediately) |
| POST | `/api/projects/:folder/message/stream` | Send message with SSE streaming response |
| GET | `/api/projects/:folder/events` | Subscribe to SSE event stream |

### Tailscale Proxy

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:folder/serve` | Expose project via Tailscale |
| DELETE | `/api/projects/:folder/serve` | Stop Tailscale proxy |

## Examples

### List available project folders

```bash
curl http://localhost:3000/api/folders
```

### Start OpenCode for a project

```bash
curl -X POST http://localhost:3000/api/projects/my-app/start
```

### Send a message to OpenCode

There are three ways to send messages, depending on your needs:

#### Sync Mode (simple, may timeout for long operations)

```bash
curl -X POST http://localhost:3000/api/projects/my-app/message \
  -H "Content-Type: application/json" \
  -d '{"message": "What does this project do?"}'
```

#### Async Mode (returns immediately, poll for results)

```bash
# Send message - returns immediately with session ID
curl -X POST http://localhost:3000/api/projects/my-app/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Refactor the auth module", "async": true}'

# Response: {"sessionId": "abc123", "status": "processing", "statusUrl": "..."}

# Poll for status and messages
curl http://localhost:3000/api/projects/my-app/sessions/abc123/status
```

#### Streaming Mode (real-time SSE, recommended for long operations)

```bash
curl -N -X POST http://localhost:3000/api/projects/my-app/message/stream \
  -H "Content-Type: application/json" \
  -d '{"message": "Build a new feature"}'
```

Returns Server-Sent Events:
```
event: session.created
data: {"sessionId":"abc123"}

event: message.part.updated
data: {"delta":"I'll help you build"}

event: message.part.updated
data: {"delta":" that feature..."}

event: session.idle
data: {"sessionID":"abc123"}

event: done
data: {"sessionId":"abc123"}
```

### Subscribe to project events

Stream all events for a project (useful for building UIs):

```bash
# All events
curl -N http://localhost:3000/api/projects/my-app/events

# Filter by session
curl -N http://localhost:3000/api/projects/my-app/events?sessionId=abc123
```

### Expose project via Tailscale

```bash
curl -X POST http://localhost:3000/api/projects/my-app/serve \
  -H "Content-Type: application/json" \
  -d '{"localPort": 3001, "path": "/my-app"}'
```

Your project will be accessible at `https://your-machine.tailnet-name.ts.net/my-app`

### Stop OpenCode for a project

```bash
curl -X DELETE http://localhost:3000/api/projects/my-app/stop
```

## How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Machine                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Remote OpenCode Server (:3000)             │   │
│  │                                                      │   │
│  │   /api/folders ──► Lists ~/projects/*               │   │
│  │   /api/projects/:name/start ──► Spawns OpenCode     │   │
│  │   /api/projects/:name/serve ──► Tailscale Proxy     │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
│         ┌─────────────────┼─────────────────┐               │
│         ▼                 ▼                 ▼               │
│   ┌──────────┐     ┌──────────┐     ┌──────────┐           │
│   │ Project A│     │ Project B│     │ Project C│           │
│   │ OpenCode │     │ OpenCode │     │ OpenCode │           │
│   │  :4001   │     │  :4002   │     │  :4003   │           │
│   └──────────┘     └──────────┘     └──────────┘           │
│         │                                                   │
│         ▼                                                   │
│   ┌──────────┐                                              │
│   │Tailscale │──────► https://machine.ts.net/project-a     │
│   │  Proxy   │                                              │
│   └──────────┘                                              │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `BASE_DIRECTORY` | Project directory | Current directory |

### Command Line Options

| Option | Description |
|--------|-------------|
| `[directory]` | Project directory (positional argument) |
| `-p, --port` | Server port |
| `-d, --doctor` | Check dependencies |
| `-v, --version` | Show version |
| `-h, --help` | Show help |

## Development

```bash
# Clone the repo
git clone https://github.com/your-username/remote-open-code.git
cd remote-open-code

# Install dependencies
bun install

# Run locally
bun run dev

# Run with a specific directory
bun run dev ~/projects
```

## License

MIT
