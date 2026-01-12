import { tailscaleService } from '../services/tailscale-service';
import { opencodeManager } from '../services/opencode-manager';
import { portManager } from '../utils/port-manager';
import { z } from 'zod';

const serveConfigSchema = z.object({
  localPort: z.number().int().positive().optional(),
  path: z.string().optional(),
  public: z.boolean().optional(),
});

/**
 * Handler for Tailscale-related endpoints
 */
export async function handleTailscale(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/').filter(Boolean);
  // pathParts will be: ['api', 'projects', 'folder', 'serve']
  // So: pathParts[0] = 'api', pathParts[1] = 'projects', pathParts[2] = 'folder', pathParts[3] = 'serve'

  // POST /api/projects/:folder/serve - Expose project via Tailscale
  if (req.method === 'POST' && pathParts.length === 4 && pathParts[3] === 'serve') {
    const folder = pathParts[2];
    try {
      const body = await req.json().catch(() => ({}));
      const validated = serveConfigSchema.parse(body);

      // Get the project to determine web app port
      const project = opencodeManager.getProject(folder);
      if (!project) {
        return Response.json({ error: 'Project not found. Start OpenCode first.' }, { status: 404 });
      }

      // Use provided port or allocate a new one
      const localPort = validated.localPort || project.webAppPort || portManager.allocateWebAppPort();
      
      // Use provided path or generate one from folder name
      const path = validated.path || `/${folder}`;

      await tailscaleService.serve(
        {
          path,
          localPort,
          public: validated.public || false,
        },
        folder
      );

      return Response.json({
        success: true,
        path,
        localPort,
        url: `https://${process.env.TAILSCALE_HOSTNAME || 'your-machine'}.ts.net${path}`,
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

  // DELETE /api/projects/:folder/serve - Stop Tailscale proxy
  if (req.method === 'DELETE' && pathParts.length === 4 && pathParts[3] === 'serve') {
    const folder = pathParts[2];
    try {
      await tailscaleService.stopServe(folder);
      return Response.json({ success: true });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  return new Response('Not Found', { status: 404 });
}
