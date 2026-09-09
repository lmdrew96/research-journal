import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLibraryTools } from './tools/library.js';
import { registerSearchTools } from './tools/search.js';
import { registerMetaTools } from './tools/meta.js';
import { registerWriteTools } from './tools/write.js';
import { registerProjectTools } from './tools/projects.js';
import { registerJournalTools } from './tools/journal.js';
import { registerStudyTools } from './tools/studies.js';
import type { McpContext } from './store.js';

export const SERVER_INFO = {
  name: 'threadnotes',
  version: '2.0.0',
} as const;

/**
 * Builds a fresh MCP server bound to one user. The HTTP transport is
 * stateless — one server per request — so the userId resolved from the
 * path token can be closed over by every tool handler.
 */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(SERVER_INFO);

  registerLibraryTools(server, ctx);
  registerSearchTools(server, ctx);
  registerMetaTools(server, ctx);
  registerWriteTools(server, ctx);
  registerProjectTools(server, ctx);
  registerJournalTools(server, ctx);
  registerStudyTools(server, ctx);

  return server;
}
