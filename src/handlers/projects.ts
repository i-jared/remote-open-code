import { opencodeManager } from '../services/opencode-manager';
import { folderService } from '../services/folder-service';
import { portManager } from '../utils/port-manager';
import type { OpenCodeMessage } from '../types';
import { z } from 'zod';

const messageSchema = z.object({
  message: z.string(),
  sessionId: z.string().optional(),
  async: z.boolean().optional(),
});

/**
 * Handler for project/opencode-related endpoints
 */
export async function handleProjects(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts will be: ['api', 'projects', 'folder', 'action']
  // So: pathParts[0] = 'api', pathParts[1] = 'projects', pathParts[2] = 'folder', pathParts[3] = 'action'

  // GET /api/projects - List all active projects
  if (req.method === 'GET' && url.pathname === '/api/projects') {
    try {
      const projects = opencodeManager.getAllProjects();
      return Response.json({ projects });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // POST /api/projects/:folder/start - Start OpenCode for a folder
  if (req.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'start') {
    const folder = pathParts[2];
    try {
      // Verify folder exists
      const exists = await folderService.folderExists(folder);
      if (!exists) {
        return Response.json({ error: 'Folder not found' }, { status: 404 });
      }

      const projectPath = folderService.getFolderPath(folder);
      const project = await opencodeManager.startOpenCode(folder, projectPath);
      return Response.json({ project });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // DELETE /api/projects/:folder/stop - Stop OpenCode for a folder
  if (req.method === 'DELETE' && pathParts.length === 4 && pathParts[3] === 'stop') {
    const folder = pathParts[2];
    try {
      await opencodeManager.stopOpenCode(folder);
      return Response.json({ success: true });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // POST /api/projects/:folder/message - Send message to OpenCode
  // Use ?async=true or body.async=true for non-blocking mode
  if (req.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'message') {
    const folder = pathParts[2];
    try {
      const body = await req.json();
      const validated = messageSchema.parse(body);
      
      // Check for async mode via query param or body
      const useAsync = validated.async || url.searchParams.get('async') === 'true';
      
      if (useAsync) {
        // Async mode: return immediately with session info
        const response = await opencodeManager.sendMessageAsync(folder, {
          message: validated.message,
          sessionId: validated.sessionId,
        });
        return Response.json(response, { status: 202 }); // 202 Accepted
      } else {
        // Sync mode: wait for response (may timeout for long operations)
        const response = await opencodeManager.sendMessage(folder, {
          message: validated.message,
          sessionId: validated.sessionId,
        });
        return Response.json(response);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ error: 'Invalid request body', details: error.errors }, { status: 400 });
      }
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // GET /api/projects/:folder/sessions - Get OpenCode sessions
  if (req.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'sessions') {
    const folder = pathParts[2];
    try {
      const sessions = await opencodeManager.getSessions(folder);
      return Response.json({ sessions });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // GET /api/projects/:folder/sessions/:sessionId/status - Get session status and messages
  // pathParts: ['api', 'projects', 'folder', 'sessions', 'sessionId', 'status']
  if (req.method === 'GET' && pathParts.length === 6 && pathParts[3] === 'sessions' && pathParts[5] === 'status') {
    const folder = pathParts[2];
    const sessionId = pathParts[4];
    try {
      const status = await opencodeManager.getSessionStatus(folder, sessionId);
      return Response.json(status);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // GET /api/projects/:folder/events - Subscribe to SSE event stream
  // Optional query param: ?sessionId=xxx to filter events
  if (req.method === 'GET' && pathParts.length === 4 && pathParts[3] === 'events') {
    const folder = pathParts[2];
    const sessionId = url.searchParams.get('sessionId') || undefined;
    
    try {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of opencodeManager.streamEvents(folder, sessionId)) {
              const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (error) {
            const errorData = `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  // POST /api/projects/:folder/message/stream - Send message and stream response via SSE
  if (req.method === 'POST' && pathParts.length === 5 && pathParts[3] === 'message' && pathParts[4] === 'stream') {
    const folder = pathParts[2];
    try {
      const body = await req.json();
      const validated = messageSchema.parse(body);

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of opencodeManager.sendMessageStream(folder, {
              message: validated.message,
              sessionId: validated.sessionId,
            })) {
              const data = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
              controller.enqueue(encoder.encode(data));
              
              if (event.done) {
                break;
              }
            }
          } catch (error) {
            const errorData = `event: error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`;
            controller.enqueue(encoder.encode(errorData));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json({ error: 'Invalid request body', details: error.errors }, { status: 400 });
      }
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  return new Response('Not Found', { status: 404 });
}
