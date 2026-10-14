import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createService } from '../app.js';
import { buildServer } from '../mcp/server.js';

const server = buildServer(createService);
process.on('SIGINT', () => { void server.close().finally(() => process.exit(0)); });
process.on('SIGTERM', () => { void server.close().finally(() => process.exit(0)); });
await server.connect(new StdioServerTransport());
