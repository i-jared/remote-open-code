import { handleFolders } from './handlers/folders';
import { handleProjects } from './handlers/projects';
import { handleTailscale } from './handlers/tailscale';

/**
 * Main request router
 */
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Route to appropriate handler
  let response: Response;

  if (pathname.startsWith('/api/folders')) {
    response = await handleFolders(req);
  } else if (pathname.startsWith('/api/projects')) {
    // Check if it's a tailscale endpoint
    if (pathname.includes('/serve')) {
      response = await handleTailscale(req);
    } else {
      response = await handleProjects(req);
    }
  } else {
    response = new Response('Not Found', { status: 404 });
  }

  // Add CORS headers to response
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
