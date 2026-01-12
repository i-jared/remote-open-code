import { folderService } from '../services/folder-service';

/**
 * Handler for folder-related endpoints
 */
export async function handleFolders(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'GET' && url.pathname === '/api/folders') {
    try {
      const folders = await folderService.listFolders();
      return Response.json({ folders });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 }
      );
    }
  }

  return new Response('Not Found', { status: 404 });
}
