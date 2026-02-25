import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerLibraryTools } from './tools/library.js';
import { registerSearchTools } from './tools/search.js';
import { registerMetaTools } from './tools/meta.js';
import { registerWriteTools } from './tools/write.js';

const server = new McpServer({
  name: 'research-journal-mcp-server',
  version: '1.0.0',
});

// Register all tools
registerLibraryTools(server);
registerSearchTools(server);
registerMetaTools(server);
registerWriteTools(server);

// Connect via stdio transport
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});