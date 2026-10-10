import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readData, writeData, getActiveProject, type McpContext } from '../store.js';
import type { Connection, ConnectionNodeType, Project } from '../../../src/types/index.js';
import { ok, err, notFound } from '../envelope.js';
import { startQuestion } from './write.js';
import {
  CONNECTION_NODE_TYPES,
  CONNECTION_RELATIONS,
  RELATION_LABELS,
  resolveConnectionEnd,
} from '../../_connections.js';

/**
 * Connections: typed "because" edges between things the project already holds.
 *
 * The rule carried over from Vertex: a connection records Nae's reasoning, so
 * it is only ever added when she asks for one, in her words — never because a
 * link looks plausible.
 */

const nodeType = z.enum(CONNECTION_NODE_TYPES as [ConnectionNodeType, ...ConnectionNodeType[]]);
const relation = z.enum(CONNECTION_RELATIONS as [Connection['relation'], ...Connection['relation'][]]);

const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** One line per connection, readable from either end. */
function describe(project: Project, c: Connection): string {
  const from = resolveConnectionEnd(project, c.fromType, c.fromId);
  const to = resolveConnectionEnd(project, c.toType, c.toId);
  const fromText = from ? `${c.fromType} "${clip(from.label)}"` : `${c.fromType} ${c.fromId} (missing)`;
  const toText = to ? `${c.toType} "${clip(to.label)}"` : `${c.toType} ${c.toId} (missing)`;
  const because = c.because ? ` — because ${c.because}` : '';
  return `- [${c.id}] ${fromText} ${RELATION_LABELS[c.relation].forward} ${toText}${because}`;
}

export function registerConnectionTools(server: McpServer, ctx: McpContext): void {
  // --- journal_add_connection ---
  server.registerTool(
    'journal_add_connection',
    {
      title: 'Add Connection',
      description:
        'Records a typed "because" connection between two items in the active project: ' +
        'articles, excerpts, questions, hypotheses, themes or studies. ONLY call this when Nae ' +
        'explicitly asks for a connection, and put her reasoning in `because` in her words — ' +
        'never add one on your own initiative because two items look related. Connections are ' +
        'directional: from <relation> to. Relations: connects_to, tension_with, contradicts ' +
        '(read the same both ways), instance_of ("from is an instance of to"), evidenced_by ' +
        '("from is evidenced by to"). Connecting an excerpt to a question moves a Not-started ' +
        'question to Exploring. Returns the new connection ID.',
      inputSchema: z.object({
        fromType: nodeType.describe('Type of the item the connection starts from'),
        fromId: z.string().min(1).describe('ID of the item the connection starts from'),
        relation: relation.describe('How the from-item relates to the to-item'),
        toType: nodeType.describe('Type of the item the connection points to'),
        toId: z.string().min(1).describe('ID of the item the connection points to'),
        because: z
          .string()
          .min(1)
          .describe("Nae's reason for the connection, in her words. Markdown is rendered."),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ fromType, fromId, relation, toType, toId, because }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);

      if (fromId === toId) return err('A connection needs two different items.', project);
      const from = resolveConnectionEnd(project, fromType, fromId);
      if (!from) return notFound(fromType, fromId, project);
      const to = resolveConnectionEnd(project, toType, toId);
      if (!to) return notFound(toType, toId, project);

      const list = project.connections ?? [];
      const duplicate = list.find(
        (c) => c.fromId === fromId && c.toId === toId && c.relation === relation,
      );
      if (duplicate) {
        return ok(project, `That connection already exists:\n${describe(project, duplicate)}`, {
          connectionId: duplicate.id,
        });
      }

      const connection: Connection = {
        id: randomUUID(),
        fromType,
        fromId,
        toType,
        toId,
        relation,
        because: because.trim(),
        createdAt: new Date().toISOString(),
      };
      project.connections = [...list, connection];

      const questionId =
        fromType === 'excerpt' && toType === 'question'
          ? toId
          : fromType === 'question' && toType === 'excerpt'
            ? fromId
            : null;
      const started = questionId ? startQuestion(project, questionId) : false;

      await writeData(ctx.userId, data);
      return ok(
        project,
        `Added connection:\n${describe(project, connection)}` +
          (started ? '\nThe question moved to Exploring.' : ''),
        { connectionId: connection.id },
      );
    },
  );

  // --- journal_get_connections ---
  server.registerTool(
    'journal_get_connections',
    {
      title: 'Get Connections',
      description:
        'Lists connections in the active project, each with its ID, both ends, relation and ' +
        '"because". Pass itemId to get only the connections touching one item (either end).',
      inputSchema: z.object({
        itemId: z.string().optional().describe('Only connections with this item at either end'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ itemId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const list = (project.connections ?? []).filter(
        (c) => !itemId || c.fromId === itemId || c.toId === itemId,
      );
      if (list.length === 0) {
        return ok(project, itemId ? `No connections touch ${itemId}.` : 'No connections yet.', {
          connections: [],
        });
      }
      return ok(
        project,
        `${list.length} connection${list.length === 1 ? '' : 's'}:\n` +
          list.map((c) => describe(project, c)).join('\n'),
        { connections: list },
      );
    },
  );

  // --- journal_delete_connection ---
  server.registerTool(
    'journal_delete_connection',
    {
      title: 'Delete Connection',
      description: 'Deletes one connection by its ID. The two items it joined are untouched.',
      inputSchema: z.object({
        connectionId: z.string().min(1).describe('The connection ID'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async ({ connectionId }) => {
      const data = await readData(ctx.userId);
      const project = getActiveProject(data);
      const list = project.connections ?? [];
      const target = list.find((c) => c.id === connectionId);
      if (!target) return notFound('Connection', connectionId, project);

      const line = describe(project, target);
      // In place, like the MCP's other mutations; the key goes when the list
      // empties, matching how the app and the recomposer omit it.
      const kept = list.filter((c) => c.id !== connectionId);
      if (kept.length > 0) project.connections = kept;
      else delete project.connections;
      await writeData(ctx.userId, data);
      return ok(project, `Deleted connection:\n${line}`);
    },
  );
}
