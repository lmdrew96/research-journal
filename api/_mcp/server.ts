import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerLibraryTools } from './tools/library.js';
import { registerSearchTools } from './tools/search.js';
import { registerMetaTools } from './tools/meta.js';
import { registerWriteTools } from './tools/write.js';
import { registerProjectTools } from './tools/projects.js';
import { registerJournalTools } from './tools/journal.js';
import { registerStudyTools } from './tools/studies.js';
import { registerConnectionTools } from './tools/connections.js';
import { registerThoughtTools } from './tools/thoughts.js';
import { z } from 'zod';
import { pinnedProject, type McpContext } from './store.js';

export const SERVER_INFO = {
  name: 'threadnotes',
  version: '2.0.0',
} as const;

/** Tools that are about projects themselves; they never take a pin. */
const PIN_EXEMPT = new Set(['journal_list_projects', 'journal_add_project']);

const PROJECT_ID_FIELD = z
  .string()
  .optional()
  .describe(
    'Optional. Work in this project for this call only, instead of the active one. The app\'s ' +
      'selected project is not changed. Use it to stay in one project for a whole conversation: ' +
      'Nae switching projects in the app otherwise retargets the next call. Ids come from ' +
      'journal_list_projects.',
  );

/**
 * Gives every project-scoped tool an optional `projectId`, in one place rather
 * than in each of ~60 handlers. The wrapped handler runs inside
 * `pinnedProject`, which getActiveProject reads, so the handlers themselves
 * don't change. Tools that already take a projectId of their own (the project
 * management tools) are left alone.
 */
function withProjectPin(server: McpServer): McpServer {
  // The SDK's registerTool generics can't express "same tool, one more field";
  // the wrapper is typed loosely and the per-tool types still check at each call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original: (name: string, config: any, cb: any) => unknown = server.registerTool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (name: string, config: any, cb: any) => {
    const schema = config?.inputSchema;
    if (PIN_EXEMPT.has(name) || (schema?.shape && 'projectId' in schema.shape)) {
      return original(name, config, cb);
    }
    return original(
      name,
      { ...config, inputSchema: schema ? schema.extend({ projectId: PROJECT_ID_FIELD }) : z.object({ projectId: PROJECT_ID_FIELD }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (args: any, extra: any) => {
        const { projectId, ...rest } = args ?? {};
        const run = () => (schema ? cb(rest, extra) : cb(extra));
        return projectId ? pinnedProject.run({ projectId }, run) : run();
      },
    );
  };
  return server;
}

/**
 * Builds a fresh MCP server bound to one user. The HTTP transport is
 * stateless — one server per request — so the userId resolved from the
 * path token can be closed over by every tool handler.
 */
export function createMcpServer(ctx: McpContext): McpServer {
  const server = withProjectPin(new McpServer(SERVER_INFO));

  registerLibraryTools(server, ctx);
  registerSearchTools(server, ctx);
  registerMetaTools(server, ctx);
  registerWriteTools(server, ctx);
  registerProjectTools(server, ctx);
  registerJournalTools(server, ctx);
  registerStudyTools(server, ctx);
  registerConnectionTools(server, ctx);
  registerThoughtTools(server, ctx);

  return server;
}
