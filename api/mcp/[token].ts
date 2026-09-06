import type { VercelRequest, VercelResponse } from '@vercel/node';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';
import { createMcpServer } from '../_mcp/server.js';

/**
 * ThreadNotes MCP endpoint — Streamable HTTP, one server instance per request.
 *
 * URL shape: /mcp/<token>, where <token> is a personal API key minted in
 * Settings (the same `api_keys` table that backs the ThreadBrain integration).
 * Token-in-path rather than a bearer header because Claude's remote-MCP
 * connector cannot attach custom headers to an upstream server.
 */

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not configured');
  return neon(url);
}

/** Resolve the path token to a Clerk user ID via its sha256 hash. */
async function getUserIdFromToken(token: string): Promise<string | null> {
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const sql = getDb();
  const rows = await sql`SELECT user_id FROM api_keys WHERE key_hash = ${keyHash}`;
  return rows.length > 0 ? (rows[0].user_id as string) : null;
}

/**
 * JSON-RPC-shaped error, so a client that failed auth sees a protocol-level
 * message rather than an opaque HTTP status.
 */
function rpcError(res: VercelResponse, status: number, code: number, message: string) {
  return res.status(status).json({
    jsonrpc: '2.0',
    error: { code, message },
    id: null,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version');
    return res.status(204).end();
  }

  const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token;
  if (!token) {
    return rpcError(res, 400, -32600, 'Missing token in path. Use /mcp/<your-api-key>.');
  }

  let userId: string | null;
  try {
    userId = await getUserIdFromToken(token);
  } catch (err) {
    console.error('[api/mcp] Token lookup failed:', err);
    return rpcError(res, 500, -32603, 'Token lookup failed.');
  }

  if (!userId) {
    return rpcError(
      res,
      401,
      -32001,
      'Invalid or revoked API key. Generate a new one in ThreadNotes → Settings → API Keys.',
    );
  }

  const server = createMcpServer({ userId });

  // Stateless: no session ID, no cross-request state to keep warm between
  // serverless invocations. enableJsonResponse returns a plain JSON body
  // instead of an SSE stream, which is what a one-shot function can deliver.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[api/mcp] Request failed:', err);
    if (!res.headersSent) {
      rpcError(res, 500, -32603, 'Internal server error.');
    }
  }
}
